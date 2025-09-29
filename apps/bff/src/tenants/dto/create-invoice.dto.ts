import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTenantInvoiceDto {
  @IsUUID()
  storeId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
