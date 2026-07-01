import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { AiModule } from '../ai/ai.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [AiModule, CurrencyModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
