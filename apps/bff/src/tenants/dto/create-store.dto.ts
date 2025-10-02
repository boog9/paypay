import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  storeName!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  btcpayHost?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  storeWebsite?: string;

}
