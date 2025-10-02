import { Repository } from 'typeorm';
import { BtcpayService } from '../src/btcpay/btcpay.service';
import { BTCPAY_MINIMAL_PERMISSIONS } from '../src/btcpay/btcpay.constants';
import { StoreEntity } from '../src/tenants/entities/store.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';

describe('BtcpayService permission builder', () => {
  it('scopes minimal permissions to the provided store', () => {
    const service = new BtcpayService(
      {
        baseUrl: 'https://btcpay.test',
        adminApiKey: 'admin-key',
        webhookUrl: 'https://bff.test/hooks/btcpay'
      },
      { findOne: jest.fn() } as unknown as Repository<StoreEntity>,
      { decrypt: jest.fn() } as unknown as EnvelopeEncryptionService
    );

    const permissions = (service as any).buildStorePermissions('store-123') as string[];
    expect(permissions).toHaveLength(BTCPAY_MINIMAL_PERMISSIONS.length);
    expect(new Set(permissions).size).toBe(BTCPAY_MINIMAL_PERMISSIONS.length);
    permissions.forEach((permission, index) => {
      expect(permission).toBe(`${BTCPAY_MINIMAL_PERMISSIONS[index]}:store-123`);
    });
  });
});
