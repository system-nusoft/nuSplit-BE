import {
  IsString,
  IsDecimal,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  Min,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SplitMethod {
  EQUAL = 'EQUAL',
  SHARES = 'SHARES',
  PERCENTAGE = 'PERCENTAGE',
  CUSTOM = 'CUSTOM',
}

export class SplitParticipantDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;
}

export class CreateExpenseDto {
  @IsString()
  @MaxLength(200)
  description: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  paidById: string;

  @IsEnum(SplitMethod)
  splitMethod: SplitMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitParticipantDto)
  participants: SplitParticipantDto[];
}
