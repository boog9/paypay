import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  declare email: string;

  @IsString()
  @MinLength(12)
  declare password: string;
}
