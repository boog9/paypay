import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  storeName!: string;

  @IsString()
  @IsNotEmpty()
  defaultCurrency!: string;

  @IsString()
  @IsOptional()
  preferredExchange?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  storeWebsite?: string;

}
