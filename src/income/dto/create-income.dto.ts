import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Frequency, IncomeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateIncomeDto {
  @ApiProperty({ example: 'Day-job salary' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: IncomeType, example: IncomeType.SALARY })
  @IsEnum(IncomeType)
  type!: IncomeType;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: Frequency, example: Frequency.MONTHLY })
  @IsEnum(Frequency)
  frequency!: Frequency;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
