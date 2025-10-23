import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BtcpayPaymentMethodsService,
  DEFAULT_PREVIEW_ADDRESS_COUNT,
  OnchainPaymentMethodConfig,
  OnchainPreviewRequest,
  OnchainPreviewResponse,
  UpdateOnchainPaymentMethodPayload
} from '../btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { INVALID_DERIVATION_MESSAGE, PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';

@Injectable()
export class OnchainWalletsService {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly paymentMethods: BtcpayPaymentMethodsService
  ) {}

  async preview(tenantUserId: string | null, storeId: string, dto: PreviewOnchainDto): Promise<OnchainPreviewResponse> {
    const userId = this.requireUserId(tenantUserId);
    const store = await this.requireStore(userId, storeId);
    const previewRequest = this.buildPreviewRequest(dto);
    const preview = await this.paymentMethods.previewOnchain(store.btcpayStoreId, 'BTC', previewRequest, { store });
    const requestedAmount = this.normalizeRequestedAmount(dto.amount);
    return {
      ...preview,
      addresses: this.normalizePreviewAddresses(preview.addresses, requestedAmount)
    };
  }

  async getConfig(tenantUserId: string | null, storeId: string): Promise<OnchainPaymentMethodConfig> {
    const userId = this.requireUserId(tenantUserId);
    const store = await this.requireStore(userId, storeId);
    return this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', { store, includeConfig: true });
  }

  async update(
    tenantUserId: string | null,
    storeId: string,
    dto: UpdateOnchainDto
  ): Promise<OnchainPaymentMethodConfig> {
    const userId = this.requireUserId(tenantUserId);
    const store = await this.requireStore(userId, storeId);
    const payload: UpdateOnchainPaymentMethodPayload = this.buildUpdatePayload(dto);
    return this.paymentMethods.updateOnchain(store.btcpayStoreId, 'BTC', payload, { store });
  }

  private buildPreviewRequest(dto: PreviewOnchainDto): OnchainPreviewRequest {
    return {
      amount: dto.amount,
      config: {
        derivationScheme: dto.derivationScheme,
        accountKeyPath: dto.accountKeyPath
      }
    };
  }

  private buildUpdatePayload(dto: UpdateOnchainDto): UpdateOnchainPaymentMethodPayload {
    return {
      enabled: dto.enabled ?? true,
      config: {
        derivationScheme: dto.derivationScheme,
        accountKeyPath: dto.accountKeyPath,
        label: dto.label
      }
    };
  }

  private requireUserId(userId: string | null): string {
    if (!userId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    const trimmed = userId.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    return trimmed;
  }

  private async requireStore(userId: string, storeId: string): Promise<ManagedStoreEntity> {
    const normalized = storeId.trim();
    if (!normalized) {
      throw new NotFoundException('Store not found');
    }
    const store = await this.storesRepository.findOne({
      where: { btcpayStoreId: normalized, userId }
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return store;
  }

  private normalizePreviewAddresses(
    addresses: OnchainPreviewResponse['addresses'],
    expectedCount: number
  ): OnchainPreviewResponse['addresses'] {
    const normalizedCount = Number.isFinite(expectedCount) && expectedCount > 0
      ? Math.max(1, Math.trunc(expectedCount))
      : DEFAULT_PREVIEW_ADDRESS_COUNT;
    const limited = Array.isArray(addresses) ? addresses.slice(0, normalizedCount) : [];
    if (limited.length < normalizedCount) {
      throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE);
    }

    return limited.map((item, index) => {
      const itemIndex = typeof item.index === 'number' && Number.isFinite(item.index)
        ? Math.trunc(item.index)
        : index;
      if (typeof item.address !== 'string' || !item.address.trim()) {
        throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE);
      }

      const keyPath = item.keyPath && item.keyPath.trim() ? item.keyPath.trim() : `0/${itemIndex}`;

      return {
        address: item.address.trim(),
        index: itemIndex,
        keyPath
      };
    });
  }

  private normalizeRequestedAmount(amount: number | undefined): number {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return DEFAULT_PREVIEW_ADDRESS_COUNT;
    }
    const normalized = Math.max(1, Math.trunc(amount));
    return normalized;
  }
}
