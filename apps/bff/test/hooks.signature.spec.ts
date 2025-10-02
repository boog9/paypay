import { createHmac } from 'crypto';
import { HooksController } from '../src/hooks/hooks.controller';
import { HooksService } from '../src/hooks/hooks.service';
import { StoreEntity } from '../src/tenants/entities/store.entity';

describe('HooksController signature validation', () => {
  const buildController = () => {
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
    const tenants = {
      registerWebhookDelivery: jest.fn().mockResolvedValue(true)
    } as any;

    const service = new HooksService(storeRepo, encryption, tenants);
    const controller = new HooksController(service);

    return { controller, service, storeRepo, encryption, tenants };
  };

  it('accepts valid signatures using the raw body buffer', async () => {
    const { controller, tenants } = buildController();
    const payload = { storeId: 'store-1', invoiceId: 'inv-1' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', 'secret-value').update(rawBody).digest('hex')}`;
    const res = { status: jest.fn().mockReturnThis() } as any;

    const response = await controller.handleBtcpayWebhook(
      { rawBody } as any,
      signature,
      'delivery-1',
      undefined,
      payload,
      res
    );

    expect(res.status).toHaveBeenCalledWith(202);
    expect(response).toEqual({ status: 'accepted' });
    expect(tenants.registerWebhookDelivery).toHaveBeenCalledWith('tenant-1', 'delivery-1', 'inv-1');
  });

  it('rejects mismatched HMAC signatures', async () => {
    const { controller, tenants, encryption } = buildController();
    const payload = { storeId: 'store-1', invoiceId: 'inv-1' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const res = { status: jest.fn() } as any;

    await expect(
      controller.handleBtcpayWebhook(
        { rawBody } as any,
        'sha256=deadbeef',
        'delivery-1',
        undefined,
        payload,
        res
      )
    ).rejects.toThrow('Invalid BTCPay signature');

    expect(encryption.decrypt).toHaveBeenCalled();
    expect(tenants.registerWebhookDelivery).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
