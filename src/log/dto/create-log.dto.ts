import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLogDto {
  @ApiProperty({ example: '2026-05-28T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  mood?: number;

  @ApiPropertyOptional({ example: 'Closed a freelance deal — felt great.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ example: ['high', 'win', 'work'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    example: 7.5,
    description: 'Optional numeric value (e.g. weight, hours-slept).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  value?: number;
}
