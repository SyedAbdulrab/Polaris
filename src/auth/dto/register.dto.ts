import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'me@polaris.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'super-secret-pw', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Abdul' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
