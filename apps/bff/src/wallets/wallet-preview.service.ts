import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { BtcpayPaymentMethodsService } from '../btcpay/btcpay.payment-methods.service';
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

    const normalizedDescriptor = dto.derivationScheme ? this.sanitizeDescriptor(dto.derivationScheme) : null;
    const sanitizedExtendedKey = dto.extendedPublicKey ? this.sanitizeExtendedKey(dto.extendedPublicKey) : null;
    const masterFingerprint = this.normalizeOptionalFingerprint(dto.masterFingerprint);

    if (normalizedDescriptor) {
      return this.paymentMethods.previewOnchainAddresses(store, {
        derivationScheme: normalizedDescriptor,
        accountKeyPath: null,
        masterFingerprint,
        label: null
      });
    }

    if (sanitizedExtendedKey) {
      const accountKeyPath = this.normalizeAccountKeyPath(dto.accountKeyPath) ?? DEFAULT_ACCOUNT_KEY_PATH;
      const descriptorFingerprint = this.resolveDescriptorFingerprint(masterFingerprint);
      const derivationScheme = this.buildDescriptorFromExtendedKey(
        sanitizedExtendedKey,
        accountKeyPath,
        descriptorFingerprint
      );

      return this.paymentMethods.previewOnchainAddresses(store, {
        derivationScheme,
        accountKeyPath,
        masterFingerprint,
        label: null
      });
    }

    throw new UnprocessableEntityException({
      code: 'INVALID_INPUT',
      message: 'Provide descriptor or extendedPublicKey'
    });
  }

  private buildDescriptorFromExtendedKey(
    extendedKey: string,
    accountKeyPath: string,
    fingerprint: string
  ): string {
    const sanitizedKey = this.sanitizeExtendedKey(extendedKey);
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
    if (!trimmed) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Provide a non-empty extended public key.'
      });
    }
    return trimmed;
  }

  private normalizeAccountKeyPath(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

  private resolveDescriptorFingerprint(fingerprint: string | null): string {
    return fingerprint ?? '00000000';
  }

  private normalizeStoreId(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      throw new UnprocessableEntityException('Store identifier is required.');
    }
    return trimmed;
  }

  private async lookupStore(storeId: string): Promise<ManagedStoreEntity> {
    const store = await this.storesRepository.findOne({
      where: [{ id: storeId }, { btcpayStoreId: storeId }]
    });

    if (!store) {
      throw new UnprocessableEntityException({
        code: 'STORE_NOT_MANAGED',
        message: 'Store is not managed by this portal.'
      });
    }

    return store;
  }
}
