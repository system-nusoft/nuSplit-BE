import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { CurrencyModule } from '../currency/currency.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [CurrencyModule, MailModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
