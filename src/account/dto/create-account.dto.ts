import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 'HBL Checking' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: AccountKind, example: AccountKind.CHECKING })
  @IsEnum(AccountKind)
  kind!: AccountKind;

  @ApiProperty({ example: 'PKR', description: 'ISO-4217 code; the native currency this account holds.' })
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO-4217 code' })
  currency!: string;

  @ApiPropertyOptional({ example: 'HBL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  institution?: string;

  @ApiProperty({ example: 400000, description: 'Balance at openingDate, in the account native currency.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance!: number;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  openingDate!: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
