import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateTenantDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  btcpayHost?: string;

  @IsString()
  @IsNotEmpty()
  storeName!: string;

  @IsBoolean()
  @IsOptional()
  includePullPayments?: boolean;
}
