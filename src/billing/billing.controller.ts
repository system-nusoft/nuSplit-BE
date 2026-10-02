import {
  Controller,
  Post,
  UseGuards,
  Req,
  Headers,
  Body,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  id: string;
  email: string;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  createCheckout(@CurrentUser() user: AuthUser) {
    return this.billingService.createCheckoutSession(user.id, user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('portal')
  createPortal(@CurrentUser() user: AuthUser) {
    return this.billingService.createPortalSession(user.id);
  }

  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Missing raw body for webhook signature verification',
      );
    }
    const event = this.billingService.constructWebhookEvent(
      req.rawBody,
      signature,
    );
    await this.billingService.handleWebhookEvent(event);
    return { received: true };
  }

  @Post('revenuecat-webhook')
  async revenueCatWebhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { event?: Record<string, unknown> },
  ) {
    await this.billingService.handleRevenueCatWebhook(
      authorization,
      body?.event,
    );
    return { received: true };
  }
}
