import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { NoSensitiveSecrets, SENSITIVE_ERROR_MESSAGE } from './preview-onchain.dto';

const MAX_EXTENDED_KEY_LENGTH = 5000;
const MAX_ACCOUNT_KEY_PATH_LENGTH = 255;

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

export class OnchainConfigBodyDto {
  @IsString()
  @MinLength(7)
  @MaxLength(MAX_EXTENDED_KEY_LENGTH)
  @Transform(({ value }) => coerceTrimmed(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  tpub!: string;

  @IsString()
  @Transform(({ value }) => coerceTrimmed(value).toUpperCase())
  @Matches(/^[0-9A-F]{8}$/u, { message: 'Root fingerprint must be 8 hexadecimal characters.' })
  rootFingerprint!: string;

  @IsString()
  @Transform(({ value }) => coerceTrimmed(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @MaxLength(MAX_ACCOUNT_KEY_PATH_LENGTH)
  accountKeyPath!: string;
}
