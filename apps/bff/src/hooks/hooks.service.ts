import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { StoreEntity } from '../tenants/entities/store.entity';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { TenantsService } from '../tenants/tenants.service';

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
    private readonly encryptionService: EnvelopeEncryptionService,
    private readonly tenantsService: TenantsService
  ) {}

  async handleWebhook(deliveryId: string, signature: string, rawBody: Buffer, payload: WebhookPayload) {
    if (!signature) {
      throw new UnauthorizedException('Missing BTCPay signature');
    }
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Missing webhook payload');
    }
    if (!payload.storeId) {
      throw new UnauthorizedException('Missing store identifier');
    }

    const store = await this.storesRepository.findOne({ where: { btcpayStoreId: payload.storeId } });
    if (!store) {
      await this.tenantsService.registerWebhookDelivery(null, deliveryId, payload.invoiceId ?? null);
      return;
    }

    this.verifySignature(store, signature, rawBody);

    const processed = await this.tenantsService.registerWebhookDelivery(store.tenantId, deliveryId, payload.invoiceId ?? null);
    if (!processed) {
      return;
    }

    // Additional domain-specific processing (e.g., invoice sync) would occur here.
  }

  private verifySignature(store: StoreEntity, signature: string, rawBody: Buffer) {
    if (!signature) {
      throw new UnauthorizedException('Missing BTCPay signature');
    }

    const secret = this.encryptionService.decrypt(store.webhookSecretCiphertext, store.webhookSecretDekWrapped);
    try {
      const hmac = createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest('hex');
      const expected = Buffer.from(`sha256=${hmac}`, 'utf8');
      const provided = Buffer.from(signature, 'utf8');
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        throw new UnauthorizedException('Invalid BTCPay signature');
      }
    } finally {
      this.clearBuffer(secret);
    }
  }

  private clearBuffer(value: string) {
    const buf = Buffer.from(value, 'utf8');
    buf.fill(0);
  }
}
