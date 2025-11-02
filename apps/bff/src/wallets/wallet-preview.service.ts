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

    const requiresDefaultAccountPath = Boolean(dto.extendedPublicKey) && !dto.accountKeyPath;
    const accountKeyPath = this.normalizeAccountKeyPath(dto.accountKeyPath, requiresDefaultAccountPath);
    const derivationScheme = this.resolveDerivationScheme(dto, accountKeyPath);
    const descriptorFingerprint = this.normalizeFingerprint(dto.masterFingerprint);
    const masterFingerprint = dto.masterFingerprint ? descriptorFingerprint : null;

    return this.paymentMethods.previewOnchainAddresses(store, {
      derivationScheme,
      accountKeyPath,
      masterFingerprint,
      label: null
    });
  }

  private resolveDerivationScheme(dto: PreviewBodyDto, accountKeyPath: string | null): string {
    if (dto.derivationScheme) {
      return this.sanitizeDescriptor(dto.derivationScheme);
    }
    if (dto.extendedPublicKey) {
      const path = accountKeyPath ?? DEFAULT_ACCOUNT_KEY_PATH;
      return this.buildDescriptorFromExtendedKey(dto.extendedPublicKey, path, dto.masterFingerprint);
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
    if (!trimmed) {
      throw new UnprocessableEntityException({
        code: 'INVALID_INPUT',
        message: 'Provide a non-empty extended public key.'
      });
    }
    return trimmed;
  }

  private normalizeAccountKeyPath(value: string | undefined, fallback: boolean): string | null {
    if (typeof value === 'string' && value.trim()) {
      const compact = value.replace(/\s+/gu, '');
      const prefixed = compact.startsWith('m/') ? compact : `m/${compact}`;
      return prefixed.endsWith("'") ? prefixed : `${prefixed}'`;
    }

    if (fallback) {
      return DEFAULT_ACCOUNT_KEY_PATH;
    }

    return null;
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
