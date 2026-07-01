import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSettlementDto {
  @IsString()
  toUserId: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
