import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { BtcpayPaymentMethodsService } from '../btcpay/btcpay.payment-methods.service';
import { isUuid } from '../shared/is-uuid';
import { PreviewBodyDto } from './dto/preview-onchain.dto';

type Bip84DescriptorInput = {
  extPub: string;
  masterFingerprint?: string;
  coinType: number;
  account?: number;
};

const EXTENDED_KEY_PREFIX_COIN_TYPE = new Map<string, number>([
  ['xpub', 0],
  ['ypub', 0],
  ['zpub', 0],
  ['tpub', 1],
  ['upub', 1],
  ['vpub', 1]
]);

export function isExtendedPubKey(candidate: string): boolean {
  if (typeof candidate !== 'string') {
    return false;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return false;
  }
  const prefix = trimmed.slice(0, 4).toLowerCase();
  if (!EXTENDED_KEY_PREFIX_COIN_TYPE.has(prefix)) {
    return false;
  }
  return /^(?:xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/iu.test(trimmed);
}

export function toBip84Descriptor({
  extPub,
  masterFingerprint,
  coinType,
  account = 0
}: Bip84DescriptorInput): string {
  const sanitizedExt = extPub.trim();
  if (!sanitizedExt) {
    throw new UnprocessableEntityException({
      code: 'INVALID_EXTENDED_KEY',
      message: 'Extended public key must not be empty.'
    });
  }

  if (!Number.isInteger(account) || account < 0) {
    throw new UnprocessableEntityException({
      code: 'INVALID_ACCOUNT_INDEX',
      message: 'Account index must be a non-negative integer.'
    });
  }

  const sanitizedFingerprint = typeof masterFingerprint === 'string' && masterFingerprint
    ? masterFingerprint.trim().toUpperCase()
    : undefined;

  if (sanitizedFingerprint) {
    return `wpkh([${sanitizedFingerprint}/84'/${coinType}'/${account}']${sanitizedExt}/0/*)`;
  }

  return `wpkh(${sanitizedExt}/0/*)`;
}

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

    const masterFingerprint = this.normalizeOptionalFingerprint(dto.masterFingerprint);

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

    if (isExtendedPubKey(derivationInput)) {
      const extendedKey = this.sanitizeExtendedKey(derivationInput);
      const coinType = this.resolveCoinType(extendedKey);
      const normalizedAccountKeyPath = this.normalizeAccountKeyPath(dto.accountKeyPath);
      const accountIndex = this.resolveAccountIndex(normalizedAccountKeyPath, coinType, extendedKey);
      const descriptor = toBip84Descriptor({
        extPub: extendedKey,
        masterFingerprint: masterFingerprint ?? undefined,
        coinType,
        account: accountIndex
      });
      return this.paymentMethods.previewOnchainAddresses(
        store.id,
        {
          derivationScheme: descriptor,
          accountKeyPath: null
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

  private isDescriptor(value: string): boolean {
    const normalized = value.replace(/\s+/gu, '');
    return /^(?:wpkh|sh|pkh|wsh|tr|sortedmulti)\(.+\)(?:#[0-9a-z]+)?$/iu.test(normalized);
  }

  private normalizeAccountKeyPath(value?: string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
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
    if (typeof value !== 'string') {
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

  private resolveCoinType(extendedKey: string): number {
    const prefix = extendedKey.slice(0, 4).toLowerCase();
    return EXTENDED_KEY_PREFIX_COIN_TYPE.get(prefix) ?? 0;
  }

  private resolveAccountIndex(
    accountKeyPath: string | null,
    coinType: number,
    extendedKey: string
  ): number {
    if (!accountKeyPath) {
      return 0;
    }

    const segments = accountKeyPath.split('/');
    if (segments.length !== 4) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: `Account key path must follow m/84'/${coinType}'/account' format.`
      });
    }

    const [root, purpose, coin, account] = segments;
    if (root.toLowerCase() !== 'm') {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: "Account key path must start with m/."
      });
    }

    if (!/^84['h]?$/iu.test(purpose)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: "Account key path must start with m/84'/."
      });
    }

    const expectedCoinType = coinType === 1 ? "1" : '0';
    const coinPattern = new RegExp(`^${expectedCoinType}(['h]?)$`, 'iu');
    if (!coinPattern.test(coin)) {
      const networkLabel = /^(tpub|upub|vpub)/iu.test(extendedKey) ? 'testnet' : 'mainnet';
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: `Account key path must use coin type ${expectedCoinType}' for ${networkLabel} keys.`
      });
    }

    const accountMatch = account.match(/^(\d+)(['h]?)$/iu);
    if (!accountMatch) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: "Account segment must be hardened (e.g., m/84'/1'/0')."
      });
    }

    const index = Number.parseInt(accountMatch[1] ?? '0', 10);
    if (!Number.isFinite(index) || index < 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACCOUNT_KEY_PATH',
        message: 'Account index must be a non-negative number.'
      });
    }

    return index;
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
