import { createHmac } from 'crypto';
import { HooksController } from '../src/hooks/hooks.controller';
import { HooksService } from '../src/hooks/hooks.service';
import { TenantsService } from '../src/tenants/tenants.service';
import { StoreEntity } from '../src/tenants/entities/store.entity';

describe('HooksController idempotency handling', () => {
  it('returns 204 for duplicate deliveries and persists the idempotency key once', async () => {
    const store: Partial<StoreEntity> = {
      tenantId: 'tenant-1',
      webhookSecretCiphertext: 'cipher',
      webhookSecretDekWrapped: 'dek',
      btcpayStoreId: 'store-1'
    };
    const storeRepo = {
      findOne: jest.fn().mockResolvedValue(store)
    } as any;
    const encryption = {
      decrypt: jest.fn().mockReturnValue('secret-value')
    } as any;

    const idempotencyRepository = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ key: 'delivery-1' }),
      insert: jest.fn().mockResolvedValue(undefined)
    } as any;

    const config = { get: jest.fn().mockReturnValue('true') } as any;

    const tenantsService = new TenantsService(
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { save: jest.fn() } as any,
      idempotencyRepository,
      encryption,
      {} as any,
      { transaction: jest.fn() } as any,
      config
    );

    const service = new HooksService(storeRepo, encryption, tenantsService);
    const controller = new HooksController(service);

    const payload = { storeId: 'store-1', invoiceId: 'inv-1' };
    const buildRawBody = () => Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', 'secret-value').update(buildRawBody()).digest('hex')}`;

    const resFirst = { status: jest.fn().mockReturnThis() } as any;
    const firstResponse = await controller.handleBtcpayWebhook(
      { rawBody: buildRawBody() } as any,
      signature,
      'delivery-1',
      undefined,
      payload,
      resFirst
    );

    expect(resFirst.status).toHaveBeenCalledWith(202);
    expect(firstResponse).toEqual({ status: 'accepted' });

    const resSecond = { status: jest.fn().mockReturnThis() } as any;
    const secondResponse = await controller.handleBtcpayWebhook(
      { rawBody: buildRawBody() } as any,
      signature,
      'delivery-1',
      undefined,
      payload,
      resSecond
    );

    expect(resSecond.status).toHaveBeenCalledWith(204);
    expect(secondResponse).toBeUndefined();
    expect(idempotencyRepository.insert).toHaveBeenCalledTimes(1);
  });
});
