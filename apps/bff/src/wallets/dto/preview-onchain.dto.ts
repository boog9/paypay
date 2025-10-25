import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf
} from 'class-validator';
import { Transform } from 'class-transformer';
import { wordlists } from 'bip39';

export const INVALID_DERIVATION_MESSAGE =
  "Enter xpub/ypub/zpub/tpub/upub/vpub or a descriptor (e.g., wpkh([FPR/84'/1'/0']tpub.../0/*)). Account key path is optional.";
export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";
export const ACCOUNT_KEY_PATH_MESSAGE = 'Account key path must be 1 to 255 characters long.';

const MIN_DERIVATION_LENGTH = 7;
const MAX_DERIVATION_LENGTH = 5000;
const MAX_ACCOUNT_KEY_PATH_LENGTH = 255;

function resolveEnglishWordlist(): string[] {
  const candidate = wordlists.english;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.filter((word): word is string => typeof word === 'string');
}

const BIP39_WORD_SET = new Set<string>(resolveEnglishWordlist().map((word) => word.toLowerCase()));

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

@ValidatorConstraint({ name: 'noSensitiveSecrets', async: false })
class NoSensitiveSecretsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return true;
    }
    const lowered = value.toLowerCase();
    const forbidden = ['seed', 'mnemonic', 'bip39', 'xprv', 'yprv', 'zprv', 'privatekey'];
    if (forbidden.some((token) => lowered.includes(token))) {
      return false;
    }

    const words = lowered.split(/[^a-z]/).filter((segment) => segment.length > 0);
    let matches = 0;
    for (const word of words) {
      if (BIP39_WORD_SET.has(word)) {
        matches += 1;
        if (matches >= 3) {
          return false;
        }
      }
    }

    return true;
  }

  defaultMessage(): string {
    return SENSITIVE_ERROR_MESSAGE;
  }
}

export function NoSensitiveSecrets(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noSensitiveSecrets',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: NoSensitiveSecretsConstraint
    });
  };
}

export class PreviewOnchainDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return '';
    }
    return String(value).trim();
  })
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @MinLength(MIN_DERIVATION_LENGTH, { message: INVALID_DERIVATION_MESSAGE })
  @MaxLength(MAX_DERIVATION_LENGTH, { message: INVALID_DERIVATION_MESSAGE })
  derivationScheme!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  @MinLength(1, { message: ACCOUNT_KEY_PATH_MESSAGE })
  @MaxLength(MAX_ACCOUNT_KEY_PATH_LENGTH, { message: ACCOUNT_KEY_PATH_MESSAGE })
  accountKeyPath?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @Matches(/^[0-9a-fA-F]{8}$/u, { message: 'Master fingerprint must be 8 hexadecimal characters.' })
  masterFingerprint?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @Matches(/^[0-9a-fA-F]{8}$/u, { message: 'Master fingerprint must be 8 hexadecimal characters.' })
  rootFingerprint?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  })
  @IsInt({ message: INVALID_DERIVATION_MESSAGE })
  @Min(1, { message: INVALID_DERIVATION_MESSAGE })
  @Max(100, { message: INVALID_DERIVATION_MESSAGE })
  amount?: number;
}

export class UpdateOnchainDto extends PreviewOnchainDto {
  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @MaxLength(120, { message: 'Label cannot exceed 120 characters.' })
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
