import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import {
  BtcpayPaymentMethodsService,
  OnchainConfigDto,
  OnchainPreviewDescriptorDto
} from '../btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { isUuid } from '../shared/is-uuid';
import { PreviewBodyDto } from './dto/preview-onchain.dto';

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

    const descriptorCandidate = typeof dto.derivationScheme === 'string' ? dto.derivationScheme.trim() : '';
    if (descriptorCandidate) {
      const descriptor = this.normalizeDescriptor(descriptorCandidate);
      const accountKeyPath = this.requireDescriptorAccountPath(dto.accountKeyPath);
      const previewDto: OnchainPreviewDescriptorDto = { derivationScheme: descriptor, accountKeyPath };
      return this.paymentMethods.previewWithDescriptor(store.id, previewDto, { store });
    }

    const tpubCandidate = typeof dto.tpub === 'string' ? dto.tpub.trim() : '';
    if (tpubCandidate) {
      const rootFingerprint = this.requireRootFingerprint(dto.rootFingerprint);
      const accountKeyPath = this.requireConfigAccountPath(dto.accountKeyPath);
      const previewDto: OnchainConfigDto = {
        tpub: tpubCandidate,
        rootFingerprint,
        accountKeyPath
      };
      return this.paymentMethods.previewWithTpub(store.id, previewDto, { store });
    }

    throw new BadRequestException(
      'Provide derivationScheme for descriptor preview or tpub, rootFingerprint, and accountKeyPath for wallet import.'
    );
  }

  private normalizeDescriptor(value: string): string {
    const normalized = value.replace(/\s+/gu, '');
    if (!normalized) {
      throw new BadRequestException('Descriptor must not be empty.');
    }
    return normalized;
  }

  private requireDescriptorAccountPath(value: string | null | undefined): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Descriptor preview потребує accountKeyPath із префіксом m/.');
    }
    const trimmed = value.trim();
    if (!/^m\//iu.test(trimmed)) {
      throw new BadRequestException('Descriptor preview потребує шляху у форматі m/...');
    }
    return trimmed;
  }

  private requireConfigAccountPath(value: string | null | undefined): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Account key path is required for tpub preview.');
    }
    const trimmed = value.trim();
    if (/^m\//iu.test(trimmed)) {
      throw new BadRequestException('Для tpub використовуйте шлях без префікса m/.');
    }
    return trimmed;
  }

  private requireRootFingerprint(value?: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Root fingerprint is required.');
    }
    const trimmed = value.trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/u.test(trimmed)) {
      throw new BadRequestException('Root fingerprint must be 8 hexadecimal characters.');
    }
    return trimmed;
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
