import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BtcpayPaymentMethodsService, BTC_CHAIN } from '../btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { OnchainWalletEntity } from './onchain-wallet.entity';

export interface WalletPresenceState {
  enabled: boolean;
  derivationScheme: string | null;
}

export interface OnchainWalletMetadataUpdate {
  derivationScheme?: string | null;
  accountKeyPath?: string | null;
  masterFingerprint?: string | null;
  label?: string | null;
}

export interface WalletMetadataState extends WalletPresenceState {
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
}

@Injectable()
export class OnchainWalletsService {
  private readonly paymentMethodId = BTC_CHAIN;

  constructor(
    @InjectRepository(OnchainWalletEntity)
    private readonly walletsRepository: Repository<OnchainWalletEntity>,
    private readonly paymentMethods: BtcpayPaymentMethodsService
  ) {}

  async getPresence(store: ManagedStoreEntity): Promise<WalletPresenceState> {
    const existing = await this.walletsRepository.findOne({
      where: {
        storeId: store.id,
        paymentMethodId: this.paymentMethodId
      },
      withDeleted: true
    });

    try {
      const remote = await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', {
        store
      });

      if (remote.enabled && remote.config?.derivationScheme) {
        await this.upsertFromBtcpay(store, remote.config);
        return {
          enabled: true,
          derivationScheme: remote.config.derivationScheme ?? null
        } satisfies WalletPresenceState;
      }

      if (!remote.enabled) {
        await this.disable(store);
        return { enabled: false, derivationScheme: null } satisfies WalletPresenceState;
      }

      const fallbackDerivation = existing?.derivationScheme ?? null;
      return {
        enabled: true,
        derivationScheme: fallbackDerivation
      } satisfies WalletPresenceState;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      if (!existing || existing.enabled !== true) {
        return { enabled: false, derivationScheme: null };
      }

      return {
        enabled: true,
        derivationScheme: existing.derivationScheme ?? null
      } satisfies WalletPresenceState;
    }
  }

  async getMetadata(store: ManagedStoreEntity): Promise<WalletMetadataState> {
    const record = await this.walletsRepository.findOne({
      where: {
        storeId: store.id,
        paymentMethodId: this.paymentMethodId
      },
      withDeleted: true
    });

    if (!record || record.enabled !== true) {
      return {
        enabled: false,
        derivationScheme: null,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      } satisfies WalletMetadataState;
    }

    return {
      enabled: true,
      derivationScheme: record.derivationScheme ?? null,
      accountKeyPath: record.accountKeyPath ?? null,
      masterFingerprint: record.masterFingerprint ?? null,
      label: record.label ?? null
    } satisfies WalletMetadataState;
  }

  async refreshFromBtcpay(store: ManagedStoreEntity, includeConfig = true) {
    const response = await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', {
      store
    });

    if (!response?.enabled) {
      await this.disable(store);
      return response;
    }

    if (includeConfig && response.config) {
      await this.upsertFromBtcpay(store, response.config);
    } else {
      await this.upsertFromBtcpay(store, {
        derivationScheme: response.config?.derivationScheme ?? null
      });
    }

    return response;
  }

  async upsertFromBtcpay(
    store: ManagedStoreEntity,
    cfg: OnchainWalletMetadataUpdate
  ): Promise<void> {
    const existing = await this.walletsRepository.findOne({
      where: {
        storeId: store.id,
        paymentMethodId: this.paymentMethodId
      },
      withDeleted: true
    });

    const normalized = this.normalizeMetadata(cfg);
    const entity = existing
      ? Object.assign(existing, {
          enabled: true,
          deletedAt: null,
          ...normalized
        })
      : this.walletsRepository.create({
          storeId: store.id,
          paymentMethodId: this.paymentMethodId,
          enabled: true,
          ...normalized
        });

    await this.walletsRepository.save(entity);
  }

  async disable(store: ManagedStoreEntity): Promise<void> {
    const existing = await this.walletsRepository.findOne({
      where: {
        storeId: store.id,
        paymentMethodId: this.paymentMethodId
      },
      withDeleted: true
    });

    if (!existing) {
      return;
    }

    existing.enabled = false;
    existing.deletedAt = new Date();
    await this.walletsRepository.save(existing);
  }

  private normalizeMetadata(cfg: OnchainWalletMetadataUpdate): Partial<OnchainWalletEntity> {
    const result: Partial<OnchainWalletEntity> = {};

    if (cfg.derivationScheme !== undefined) {
      result.derivationScheme = this.trimOrNull(cfg.derivationScheme);
    }

    if (cfg.accountKeyPath !== undefined) {
      result.accountKeyPath = this.trimOrNull(cfg.accountKeyPath);
    }

    if (cfg.masterFingerprint !== undefined) {
      const normalized = this.trimOrNull(cfg.masterFingerprint);
      result.masterFingerprint = normalized ? normalized.toUpperCase() : null;
    }

    if (cfg.label !== undefined) {
      result.label = this.trimOrNull(cfg.label);
    }

    return result;
  }

  private trimOrNull(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

}
