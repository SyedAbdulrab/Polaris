import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'me@polaris.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'super-secret-pw' })
  @IsString()
  password!: string;
}
