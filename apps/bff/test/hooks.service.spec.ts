import { createHmac } from 'crypto';
import { HooksService } from '../src/hooks/hooks.service';
import { StoreEntity } from '../src/tenants/entities/store.entity';

describe('HooksService', () => {
  const makeService = () => {
    const store: Partial<StoreEntity> = {
      tenantId: 'tenant-1',
      webhookSecretCiphertext: 'cipher',
      webhookSecretDekWrapped: 'dek',
      btcpayStoreId: 'store-1'
    };
    const storeRepo = {
      findOne: jest.fn().mockResolvedValue(store)
    } as any;
    const managedRepo = {
      findOne: jest.fn().mockResolvedValue(null)
    } as any;
    const encryption = {
      decrypt: jest.fn().mockReturnValue('secret-value')
    } as any;
    const tenants = {
      registerWebhookDelivery: jest.fn().mockResolvedValue(true)
    } as any;

    const service = new HooksService(storeRepo, managedRepo, encryption, tenants);
    return { service, storeRepo, managedRepo, encryption, tenants, store: store as StoreEntity };
  };

  it('accepts valid signatures', async () => {
    const { service, tenants, encryption } = makeService();
    const body = Buffer.from(JSON.stringify({ storeId: 'store-1', invoiceId: 'inv-1' }));
    const signature = `sha256=${createHmac('sha256', 'secret-value').update(body).digest('hex')}`;

    const processed = await service.handleWebhook('delivery-1', signature, body, {
      storeId: 'store-1',
      invoiceId: 'inv-1'
    });

    expect(encryption.decrypt).toHaveBeenCalled();
    expect(tenants.registerWebhookDelivery).toHaveBeenCalledWith('tenant-1', 'delivery-1', 'inv-1');
    expect(processed).toBe(true);
  });

  it('rejects invalid signatures', async () => {
    const { service } = makeService();
    const body = Buffer.from(JSON.stringify({ storeId: 'store-1' }));

    await expect(
      service.handleWebhook('delivery-2', 'sha256=deadbeef', body, {
        storeId: 'store-1'
      })
    ).rejects.toThrow('Invalid BTCPay signature');
  });

  it('rejects signatures without the sha256 prefix', async () => {
    const { service } = makeService();
    const body = Buffer.from(JSON.stringify({ storeId: 'store-1' }));

    await expect(
      service.handleWebhook('delivery-3', 'deadbeef', body, {
        storeId: 'store-1'
      })
    ).rejects.toThrow('Invalid BTCPay signature format');
  });

  it('trims signature whitespace before comparison', async () => {
    const { service, tenants } = makeService();
    const payload = { storeId: 'store-1', invoiceId: 'inv-2' };
    const body = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', 'secret-value').update(body).digest('hex')}`;

    const processed = await service.handleWebhook('delivery-4', `  ${signature}  `, body, payload);

    expect(processed).toBe(true);
    expect(tenants.registerWebhookDelivery).toHaveBeenCalledWith('tenant-1', 'delivery-4', 'inv-2');
  });
});
