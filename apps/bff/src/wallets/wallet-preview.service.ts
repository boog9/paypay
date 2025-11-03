import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { BtcpayPaymentMethodsService } from '../btcpay/btcpay.payment-methods.service';
import { isUuid } from '../shared/is-uuid';
import { PreviewBodyDto } from './dto/preview-onchain.dto';

const DEFAULT_ACCOUNT_KEY_PATH = "m/84'/1'/0'";

@Injectable()
export class WalletPreviewService {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly paymentMethods: BtcpayPaymentMethodsService
  ) {}

  async previewOnchainProposedConfig(storeId: string, dto: PreviewBodyDto) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const store = await this.lookupStore(normalizedStoreId);

    this.normalizeOptionalFingerprint(dto.masterFingerprint);

    const derivationInput = this.normalizeDerivationInput(dto.derivationScheme);

    if (this.isDescriptor(derivationInput)) {
      const descriptor = this.sanitizeDescriptor(derivationInput);
      return this.paymentMethods.previewOnchainAddresses(
        store.id,
        {
          derivationScheme: descriptor,
          accountKeyPath: null
        },
        { store }
      );
    }

    if (this.isExtendedPublicKey(derivationInput)) {
      const extendedKey = this.sanitizeExtendedKey(derivationInput);
      const accountKeyPath = this.normalizeAccountKeyPath(dto.accountKeyPath) ?? DEFAULT_ACCOUNT_KEY_PATH;
      this.assertValidAccountKeyPath(extendedKey, accountKeyPath);
      return this.paymentMethods.previewOnchainAddresses(
        store.id,
        {
          derivationScheme: extendedKey,
          accountKeyPath
        },
        { store }
      );
    }

    throw new UnprocessableEntityException({
      code: 'INVALID_INPUT',
      message: 'Provide descriptor or extended public key.'
    });
  }

  private normalizeDerivationInput(value?: string): string {
    if (typeof value !== 'string') {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Provide descriptor or extended public key.'
      });
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Provide descriptor or extended public key.'
      });
    }
    return trimmed;
  }

  private sanitizeDescriptor(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Descriptor must be a non-empty string.'
      });
    }
    const normalized = trimmed.replace(/\s+/gu, '');
    if (!this.isDescriptor(normalized)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Descriptor format is not supported.'
      });
    }
    return normalized;
  }

  private sanitizeExtendedKey(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Provide a non-empty extended public key.'
      });
    }
    return trimmed;
  }

  private isExtendedPublicKey(value: string): boolean {
    return /^(?:xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/iu.test(value.trim());
  }

  private isDescriptor(value: string): boolean {
    const normalized = value.replace(/\s+/gu, '');
    return /^(?:wpkh|sh|pkh|wsh|tr|sortedmulti)\(.+\)(?:#[0-9a-z]+)?$/iu.test(normalized);
  }

  private normalizeAccountKeyPath(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: 'Account key path cannot be empty.'
      });
    }
    return trimmed;
  }

  private normalizeOptionalFingerprint(value?: string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    if (!/^[0-9a-fA-F]{8}$/u.test(trimmed)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_FINGERPRINT',
        message: 'Master fingerprint must be 8 hexadecimal characters.'
      });
    }
    return trimmed.toUpperCase();
  }

  private assertValidAccountKeyPath(extendedKey: string, accountKeyPath: string): void {
    const trimmedPath = accountKeyPath.trim();
    if (!trimmedPath) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: 'Account key path cannot be empty.'
      });
    }

    if (/^(tpub|upub|vpub)/iu.test(extendedKey)) {
      const segments = trimmedPath.split('/');
      if (segments.length < 4) {
        throw new UnprocessableEntityException({
          code: 'INVALID_ACCOUNT_KEY_PATH',
          message: "Testnet account key path must follow m/84'/1'/account' format."
        });
      }

      const [root, purpose, coinType] = segments;
      if (root.toLowerCase() !== 'm' || !/^84['h]?$/u.test(purpose)) {
        throw new UnprocessableEntityException({
          code: 'INVALID_ACCOUNT_KEY_PATH',
          message: "Account key path must start with m/84'/."
        });
      }

      if (!/^1['h]?$/u.test(coinType)) {
        throw new UnprocessableEntityException({
          code: 'INVALID_ACCOUNT_KEY_PATH',
          message: "Testnet extended keys must use coin type 1'."
        });
      }
    }
  }

  private normalizeStoreId(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      throw new UnprocessableEntityException('Store identifier is required.');
    }
    return trimmed;
  }

  private async lookupStore(storeId: string): Promise<ManagedStoreEntity> {
    const where: FindOptionsWhere<ManagedStoreEntity>[] = isUuid(storeId)
      ? [{ id: storeId }, { btcpayStoreId: storeId }]
      : [{ btcpayStoreId: storeId }];

    const store = await this.storesRepository.findOne({ where });

    if (!store) {
      throw new UnprocessableEntityException({
        code: 'STORE_NOT_MANAGED',
        message: 'Store is not managed by this portal.'
      });
    }

    return store;
  }
}
