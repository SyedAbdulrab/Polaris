import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Frequency } from '@prisma/client';
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

export class CreateExpenseDto {
  @ApiProperty({ example: 'Rent' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'housing' })
  @IsString()
  @MaxLength(60)
  category!: string;

  @ApiProperty({ example: 1800 })
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
