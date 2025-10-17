import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

const ISO4217_REGEX = /^[A-Za-z]{3}$/;

export class CreateStoreDto {
  @IsString()
  @Length(3, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString()
  @Length(3, 3)
  @Matches(ISO4217_REGEX, { message: 'defaultCurrency must be a valid ISO 4217 code.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  defaultCurrency!: string;
}
