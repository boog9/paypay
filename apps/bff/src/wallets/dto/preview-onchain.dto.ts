import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf,
  IsBoolean
} from 'class-validator';
import { Transform } from 'class-transformer';

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
    if (/\s/.test(value)) {
      return false;
    }
    const forbidden = ['seed', 'mnemonic', 'bip39', 'xprv', 'yprv', 'zprv', 'privatekey'];
    return !forbidden.some((token) => lowered.includes(token));
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Seeds, mnemonics or private keys must never be submitted.';
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
  @Transform(({ value }) => normalizeString(value))
  @Length(1, 512, { message: 'Derivation scheme must be between 1 and 512 characters long.' })
  @Matches(/^\S+$/, { message: 'Derivation scheme must not contain whitespace.' })
  @NoSensitiveSecrets({ message: 'Seeds, mnemonics or private keys must never be submitted.' })
  derivationScheme!: string;

  @IsOptional()
  @ValidateIf((_obj, value) => typeof value === 'string')
  @IsString()
  @Transform(({ value }) => normalizeString(value))
  @MaxLength(200, { message: 'Account key path cannot exceed 200 characters.' })
  @Matches(/^\S+$/, { message: 'Account key path must not contain whitespace.' })
  @NoSensitiveSecrets({ message: 'Account key path must not include sensitive information.' })
  accountKeyPath?: string;
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
