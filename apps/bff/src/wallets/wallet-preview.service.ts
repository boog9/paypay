import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { BtcpayService } from '../btcpay/btcpay.service';
import { PreviewBodyDto } from './dto/preview-onchain.dto';

interface PreviewOptions {
  requestId?: string;
}

const EXTENDED_KEY_REGEX = /^(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/iu;
const DEFAULT_ACCOUNT_KEY_PATH = "m/84'/1'/0'";

@Injectable()
export class WalletPreviewService {
  constructor(private readonly btcpay: BtcpayService) {}

  async previewOnchainProposedConfig(storeId: string, dto: PreviewBodyDto, options?: PreviewOptions) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const cryptoCode = this.normalizeCryptoCode(dto.cryptoCode);
    this.assertBitcoinOnly(cryptoCode);

    const accountKeyPath = this.normalizeAccountKeyPath(dto.accountKeyPath);
    const derivationScheme = this.resolveDerivationScheme(dto, accountKeyPath);

    const payload: Record<string, unknown> = {
      derivationScheme,
      accountKeyPath,
      count: 10
    };

    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'POST',
      path: this.buildPreviewPath(normalizedStoreId, cryptoCode),
      data: payload,
      requestId: options?.requestId
    });
  }

  private resolveDerivationScheme(dto: PreviewBodyDto, accountKeyPath: string): string {
    if (dto.derivationScheme) {
      return this.sanitizeDescriptor(dto.derivationScheme);
    }
    if (dto.extendedPublicKey) {
      return this.buildDescriptorFromExtendedKey(dto.extendedPublicKey, accountKeyPath, dto.masterFingerprint);
    }
    throw new UnprocessableEntityException({
      code: 'INVALID_INPUT',
      message: 'Provide descriptor or extendedPublicKey'
    });
  }

  private buildDescriptorFromExtendedKey(
    extendedKey: string,
    accountKeyPath: string,
    masterFingerprint?: string
  ): string {
    const sanitizedKey = this.sanitizeExtendedKey(extendedKey);
    const fingerprint = this.normalizeFingerprint(masterFingerprint);
    const suffix = accountKeyPath.replace(/^m\//iu, '');
    return `wpkh([${fingerprint}/${suffix}]${sanitizedKey}/0/*)`;
  }

  private sanitizeDescriptor(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Descriptor must be a non-empty string.'
      });
    }
    return trimmed.replace(/\s+/gu, '');
  }

  private sanitizeExtendedKey(value: string): string {
    const trimmed = value.trim();
    if (!EXTENDED_KEY_REGEX.test(trimmed)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Unsupported extended public key format.'
      });
    }
    return trimmed;
  }

  private normalizeAccountKeyPath(value?: string): string {
    if (!value) {
      return DEFAULT_ACCOUNT_KEY_PATH;
    }
    const compact = value.replace(/\s+/gu, '');
    if (!/^m\/84'\/1'\/\d+'?$/iu.test(compact)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: "Account key path must follow m/84'/1'/account'."
      });
    }
    return compact.endsWith("'") ? compact : `${compact}'`;
  }

  private normalizeFingerprint(value?: string): string {
    if (!value) {
      return '00000000';
    }
    const trimmed = value.trim();
    if (!/^[0-9a-fA-F]{8}$/.test(trimmed)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_FINGERPRINT',
        message: 'Master fingerprint must be 8 hexadecimal characters.'
      });
    }
    return trimmed.toUpperCase();
  }

  private normalizeStoreId(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      throw new UnprocessableEntityException('Store identifier is required.');
    }
    return trimmed;
  }

  private normalizeCryptoCode(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('cryptoCode is required.');
    }
    return trimmed.toUpperCase();
  }

  private assertBitcoinOnly(cryptoCode: string): void {
    if (cryptoCode !== 'BTC') {
      throw new BadRequestException('Only BTC on-chain wallets are supported.');
    }
  }

  private buildPreviewPath(storeId: string, cryptoCode: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/OnChain/${encodeURIComponent(
      cryptoCode
    )}/preview`;
  }
}
