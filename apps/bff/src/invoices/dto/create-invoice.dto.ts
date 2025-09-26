import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateInvoiceDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
