import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListTransactionQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ enum: TransactionKind })
  @IsOptional()
  @IsEnum(TransactionKind)
  kind?: TransactionKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower bound on date.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Inclusive upper bound on date.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Filter to transactions linked to this income rule.' })
  @IsOptional()
  @IsString()
  sourceIncomeId?: string;

  @ApiPropertyOptional({ description: 'Filter to transactions linked to this expense rule.' })
  @IsOptional()
  @IsString()
  sourceExpenseId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
