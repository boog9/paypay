import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  storeName!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  btcpayHost?: string;

  @IsBoolean()
  @IsOptional()
  includePullPayments?: boolean;
}
