import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';
import { wordlists } from 'bip39';

export const SENSITIVE_ERROR_MESSAGE =
  "Never paste seeds or private keys. Provide an extended public key or output descriptor only.";

function resolveEnglishWordlist(): string[] {
  const candidate = wordlists.english;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.filter((word): word is string => typeof word === 'string');
}

const BIP39_WORD_SET = new Set<string>(resolveEnglishWordlist().map((word) => word.toLowerCase()));

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

function coerceTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class PreviewBodyDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => coerceTrimmedString(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  derivationScheme?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => coerceTrimmedString(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  extendedPublicKey?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => coerceTrimmedString(value))
  @NoSensitiveSecrets({ message: SENSITIVE_ERROR_MESSAGE })
  accountKeyPath?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    const normalized = coerceTrimmedString(value);
    return normalized ? normalized.toUpperCase() : undefined;
  })
  @Matches(/^[0-9A-F]{8}$/u, { message: 'Master fingerprint must be 8 hexadecimal characters.' })
  masterFingerprint?: string;
}
