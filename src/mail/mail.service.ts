import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly client: SESClient;
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly otpTemplate: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.getOrThrow<string>('SES_FROM_MAIL');

    this.client = new SESClient({
      region: this.config.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.otpTemplate = fs.readFileSync(
      path.join(__dirname, 'templates', 'verification-otp.html'),
      'utf-8',
    );
  }

  async sendBalanceReminder(
    email: string,
    name: string,
    groupName: string,
    amount: string,
    currency: string,
    creditorName: string,
  ): Promise<void> {
    const displayName = name || email;
    const html = `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:8px">Payment reminder</h2>
        <p style="font-size:15px;color:#374151;margin-bottom:24px">
          Hi ${displayName},<br/><br/>
          You owe <strong>${creditorName}</strong> <strong>${currency} ${amount}</strong> in
          <strong>${groupName}</strong> on Spliit.
        </p>
        <p style="font-size:13px;color:#9ca3af">This is an automated reminder sent by a group member.</p>
      </div>`;

    const command = new SendEmailCommand({
      Source: `"Spliit" <${this.from}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: `Reminder: You owe ${creditorName} in ${groupName}`, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    });

    await this.client.send(command);
    this.logger.log(`Balance reminder sent to ${email}`);
  }

  async sendVerificationOtp(email: string, otp: string, name?: string): Promise<void> {
    const html = this.otpTemplate
      .replace(/{{displayName}}/g, name ?? email)
      .replace(/{{otp}}/g, otp)
      .replace(/{{year}}/g, new Date().getFullYear().toString());

    const command = new SendEmailCommand({
      Source: `"Spliit" <${this.from}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Your Spliit verification code', Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    });

    await this.client.send(command);
    this.logger.log(`Verification OTP sent to ${email}`);
  }
}
