import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { StoreEntity } from '../tenants/entities/store.entity';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { TenantsService } from '../tenants/tenants.service';
import { ManagedStoreEntity } from '../stores/managed-store.entity';

interface WebhookPayload {
  storeId?: string;
  invoiceId?: string;
  [key: string]: unknown;
}

@Injectable()
export class HooksService {
  constructor(
    @InjectRepository(StoreEntity)
    private readonly storesRepository: Repository<StoreEntity>,
    @InjectRepository(ManagedStoreEntity)
    private readonly managedStoresRepository: Repository<ManagedStoreEntity>,
    private readonly encryptionService: EnvelopeEncryptionService,
    private readonly tenantsService: TenantsService
  ) {}

  async handleWebhook(
    deliveryId: string,
    signature: string,
    rawBody: Buffer,
    payload: WebhookPayload
  ): Promise<boolean> {
    if (!signature) {
      throw new UnauthorizedException('Missing BTCPay signature');
    }
    if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new UnauthorizedException('Missing webhook payload');
    }
    if (!payload.storeId) {
      throw new UnauthorizedException('Missing store identifier');
    }

    const secretRecord = await this.resolveWebhookSecret(payload.storeId);
    if (!secretRecord) {
      return this.tenantsService.registerWebhookDelivery(
        null,
        deliveryId,
        payload.invoiceId ?? null
      );
    }

    let decryptedSecret = this.encryptionService.decrypt(
      secretRecord.ciphertext,
      secretRecord.dekWrapped
    );
    let secretBuffer: Buffer | null = null;
    try {
      secretBuffer = Buffer.from(decryptedSecret, 'utf8');
      decryptedSecret = '';
      this.verifySignature(secretBuffer, signature, rawBody);
    } finally {
      if (secretBuffer) {
        secretBuffer.fill(0);
      }
    }

    const processed = await this.tenantsService.registerWebhookDelivery(
      secretRecord.tenantId,
      deliveryId,
      payload.invoiceId ?? null
    );
    if (!processed) {
      return false;
    }

    // Additional domain-specific processing (e.g., invoice sync) would occur here.
    return true;
  }

  private verifySignature(secret: Buffer, signature: string, rawBody: Buffer) {
    if (!signature) {
      throw new UnauthorizedException('Missing BTCPay signature');
    }

    const normalized = signature.trim();
    if (!normalized.startsWith('sha256=')) {
      throw new UnauthorizedException('Invalid BTCPay signature format');
    }

    const hmac = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expected = Buffer.from(`sha256=${hmac}`, 'utf8');
    const provided = Buffer.from(normalized, 'utf8');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('Invalid BTCPay signature');
    }
  }

  private async resolveWebhookSecret(
    storeId: string
  ): Promise<{ tenantId: string | null; ciphertext: string; dekWrapped: string } | null> {
    const tenantStore = await this.storesRepository.findOne({ where: { btcpayStoreId: storeId } });
    if (
      tenantStore?.webhookSecretCiphertext &&
      tenantStore?.webhookSecretDekWrapped
    ) {
      return {
        tenantId: tenantStore.tenantId,
        ciphertext: tenantStore.webhookSecretCiphertext,
        dekWrapped: tenantStore.webhookSecretDekWrapped,
      };
    }

    const managedStore = await this.managedStoresRepository.findOne({ where: { btcpayStoreId: storeId } });
    if (
      managedStore?.webhookSecretCiphertext &&
      managedStore?.webhookSecretDekWrapped
    ) {
      return {
        tenantId: null,
        ciphertext: managedStore.webhookSecretCiphertext,
        dekWrapped: managedStore.webhookSecretDekWrapped,
      };
    }

    return null;
  }
}
