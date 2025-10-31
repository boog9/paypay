import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';
import { NoSensitiveSecrets, SENSITIVE_ERROR_MESSAGE } from './preview-onchain.dto';

const MIN_DERIVATION_LENGTH = 7;
const MAX_DERIVATION_LENGTH = 5000;
const MAX_ACCOUNT_KEY_PATH_LENGTH = 255;
const MAX_LABEL_LENGTH = 160;

function coerceOptionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function coerceTrimmed(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof String) {
    return value.valueOf().trim();
  }
  return '';
}

export class UpdateBitcoinWalletDto {
  @IsString()
  @Transform(({ value }) => coerceTrimmed(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @MinLength(MIN_DERIVATION_LENGTH)
  @MaxLength(MAX_DERIVATION_LENGTH)
  derivationScheme!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => coerceOptionalTrimmed(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @MaxLength(MAX_ACCOUNT_KEY_PATH_LENGTH)
  accountKeyPath?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) {
      return null;
    }
    return coerceOptionalTrimmed(value);
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Matches(/^[0-9a-fA-F]{8}$/u, { message: 'Master fingerprint must be 8 hexadecimal characters.' })
  masterFingerprint?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => coerceOptionalTrimmed(value))
  @MaxLength(MAX_LABEL_LENGTH)
  label?: string;
}
