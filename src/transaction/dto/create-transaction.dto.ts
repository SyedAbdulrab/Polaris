import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ example: 'cuid_of_account' })
  @IsString()
  accountId!: string;

  @ApiProperty({ example: '2026-05-01T12:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiProperty({
    example: 5000,
    description: 'Always positive. Direction is encoded by `kind`. In the account native currency.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: TransactionKind, example: TransactionKind.INFLOW })
  @IsEnum(TransactionKind)
  kind!: TransactionKind;

  @ApiPropertyOptional({ example: 'salary', description: 'Free-form. e.g. salary, freelance, food.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ example: 'May paycheck' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Link this transaction to a recurring income rule.' })
  @IsOptional()
  @IsString()
  sourceIncomeId?: string;

  @ApiPropertyOptional({ description: 'Link this transaction to a recurring expense rule.' })
  @IsOptional()
  @IsString()
  sourceExpenseId?: string;

  @ApiPropertyOptional({
    description:
      'For TRANSFER kind only — the destination account. A mirror INFLOW row will be created automatically on the destination account.',
  })
  @IsOptional()
  @IsString()
  transferToAccountId?: string;

  @ApiPropertyOptional({
    description:
      'For cross-currency TRANSFERs — the credited amount on the destination account in its currency. Defaults to `amount` if both accounts share a currency.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  transferToAmount?: number;
}
