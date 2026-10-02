import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlatform } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(BillingService.name);
  private readonly priceId: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
    this.priceId = this.config.getOrThrow<string>('STRIPE_PRICE_ID_MONTHLY');
    this.frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
  }

  async createCheckoutSession(
    userId: string,
    email: string,
  ): Promise<{ url: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: this.priceId, quantity: 1 }],
      success_url: `${this.frontendUrl}/account?upgraded=true`,
      cancel_url: `${this.frontendUrl}/account`,
    });

    if (!session.url) {
      throw new BadRequestException('Failed to create checkout session');
    }
    return { url: session.url };
  }

  async createPortalSession(userId: string): Promise<{ url: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No billing account found for this user');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/account`,
    });
    return { url: session.url };
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : (session.customer?.id ?? null);
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

        if (!userId || !subscriptionId) {
          this.logger.warn(
            'checkout.session.completed missing userId or subscriptionId',
          );
          break;
        }

        const subscription =
          await this.stripe.subscriptions.retrieve(subscriptionId);
        await this.syncSubscription(userId, customerId, subscription);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        const user = await this.prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!user) {
          this.logger.warn(`No user found for Stripe customer ${customerId}`);
          break;
        }
        await this.syncSubscription(user.id, customerId, subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : (invoice.customer?.id ?? null);
        if (!customerId) break;

        const user = await this.prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!user) break;

        await this.prisma.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'past_due' },
        });
        break;
      }

      default:
        break;
    }
  }

  private async syncSubscription(
    userId: string,
    customerId: string | null,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const isActive =
      subscription.status === 'active' || subscription.status === 'trialing';
    // Stripe moved current_period_end from the subscription to its items as of the 2025 billing model.
    const periodEndSeconds = subscription.items.data[0]?.current_period_end;
    const periodEnd = periodEndSeconds
      ? new Date(periodEndSeconds * 1000)
      : null;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(customerId && { stripeCustomerId: customerId }),
        stripeSubscriptionId: subscription.id,
        subscriptionPlatform: SubscriptionPlatform.STRIPE,
        subscriptionStatus: subscription.status,
        subscriptionCurrentPeriodEnd: periodEnd,
        isPremium: isActive,
      },
    });

    this.logger.log(
      `Synced subscription ${subscription.id} for user ${userId}: status=${subscription.status} isPremium=${isActive}`,
    );
  }

  async handleRevenueCatWebhook(
    authorization: string | undefined,
    event: Record<string, unknown> | undefined,
  ): Promise<void> {
    const expectedAuth = this.config.getOrThrow<string>(
      'REVENUECAT_WEBHOOK_AUTH_HEADER',
    );
    if (authorization !== expectedAuth) {
      throw new UnauthorizedException(
        'Invalid RevenueCat webhook authorization',
      );
    }

    const userId = event?.app_user_id as string | undefined;
    const type = event?.type as string | undefined;
    if (!userId || !type) {
      this.logger.warn('RevenueCat webhook missing app_user_id or type');
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`RevenueCat webhook for unknown user ${userId}`);
      return;
    }

    const expirationMs = event?.expiration_at_ms as number | undefined;
    const periodEnd = expirationMs
      ? new Date(expirationMs)
      : user.subscriptionCurrentPeriodEnd;

    const ACTIVATING_EVENTS = new Set([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
    ]);

    let isPremium = user.isPremium;
    let subscriptionStatus = user.subscriptionStatus;

    if (ACTIVATING_EVENTS.has(type)) {
      isPremium = true;
      subscriptionStatus = 'active';
    } else if (type === 'EXPIRATION') {
      // Subscription actually lapsed - this is the only event that should revoke access.
      isPremium = false;
      subscriptionStatus = 'expired';
    } else if (type === 'CANCELLATION') {
      // User turned off auto-renew but keeps access until EXPIRATION fires at period end.
      subscriptionStatus = 'cancelled';
    } else if (type === 'BILLING_ISSUE') {
      // Apple/Google retry grace period - keeps access until EXPIRATION fires.
      subscriptionStatus = 'past_due';
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionPlatform: SubscriptionPlatform.REVENUECAT,
        subscriptionStatus,
        subscriptionCurrentPeriodEnd: periodEnd,
        isPremium,
      },
    });

    this.logger.log(
      `RevenueCat ${type} for user ${userId}: isPremium=${isPremium}`,
    );
  }
}
