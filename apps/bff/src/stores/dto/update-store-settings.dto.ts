import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateStoreSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  website?: string | null;

  @IsOptional()
  @IsString()
  @Length(3, 12)
  defaultCurrency?: string;
}

export interface StoreSettingsDto {
  storeId: string;
  name: string;
  website: string | null;
  defaultCurrency: string;
}
