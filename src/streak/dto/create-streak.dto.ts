import { ApiProperty } from '@nestjs/swagger';
import { StreakType } from '@prisma/client';
import { IsEnum, IsString, MaxLength } from 'class-validator';

export class CreateStreakDto {
  @ApiProperty({ example: 'No nicotine' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: StreakType, example: StreakType.POSITIVE })
  @IsEnum(StreakType)
  type!: StreakType;
}
