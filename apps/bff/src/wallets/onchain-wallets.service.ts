import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BtcpayPaymentMethodsService,
  OnchainPaymentMethodConfig,
  OnchainPreviewResponse,
  UpdateOnchainPaymentMethodPayload
} from '../btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';

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
    return this.paymentMethods.previewOnchain(store.btcpayStoreId, 'BTC', dto, { store });
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
    const payload: UpdateOnchainPaymentMethodPayload = {
      enabled: dto.enabled ?? true,
      derivationScheme: dto.derivationScheme,
      accountKeyPath: dto.accountKeyPath,
      label: dto.label
    };
    return this.paymentMethods.updateOnchain(store.btcpayStoreId, 'BTC', payload, { store });
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
}
