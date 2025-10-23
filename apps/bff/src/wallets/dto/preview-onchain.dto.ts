import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf
} from 'class-validator';
import { Transform } from 'class-transformer';
import { wordlists } from 'bip39';

export const INVALID_DERIVATION_MESSAGE =
  "Invalid derivation scheme. Examples: xpub..., ypub..., wpkh([FPR/...']xpub.../0/*). Set AccountKeyPath like m/84'/0'/0'.";
const DERIVATION_PATTERN = /^[A-Za-z0-9[\]()'/*_,:-]+$/u;

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
    return INVALID_DERIVATION_MESSAGE;
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
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @Length(1, 512, { message: INVALID_DERIVATION_MESSAGE })
  @Matches(DERIVATION_PATTERN, { message: INVALID_DERIVATION_MESSAGE })
  @NoSensitiveSecrets({ message: INVALID_DERIVATION_MESSAGE })
  derivationScheme!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @MaxLength(200, { message: INVALID_DERIVATION_MESSAGE })
  @Matches(/^(?:m|[0-9a-fA-F]{8})(\/\d+'?){2,8}$/i, { message: INVALID_DERIVATION_MESSAGE })
  @NoSensitiveSecrets({ message: INVALID_DERIVATION_MESSAGE })
  accountKeyPath?: string;

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
