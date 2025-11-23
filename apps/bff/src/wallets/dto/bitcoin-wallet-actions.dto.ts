import { IsOptional, IsString } from 'class-validator';

export class ConfirmDangerousActionDto {
  @IsString()
  @IsOptional()
  confirmation?: string;
}
