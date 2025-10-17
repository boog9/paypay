import { Repository } from 'typeorm';
import { ConflictException } from '@nestjs/common';
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

describe('BtcpayService error handling', () => {
  function buildService(): BtcpayService {
    return new BtcpayService(
      {
        baseUrl: 'https://btcpay.test',
        adminApiKey: 'admin-key',
        webhookUrl: 'https://bff.test/hooks/btcpay'
      },
      { findOne: jest.fn() } as unknown as Repository<StoreEntity>,
      { decrypt: jest.fn() } as unknown as EnvelopeEncryptionService
    );
  }

  it('maps BTCPay 422 username errors to ConflictException', async () => {
    const service = buildService();
    const httpMock = {
      post: jest.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 422,
          data: [
            { path: 'Email', message: 'Username merchant@example.com is already taken.' },
            { path: 'Password', message: 'Irrelevant validation error' }
          ]
        }
      })
    };
    (service as any).createHttp = jest.fn().mockReturnValue(httpMock);

    await expect(
      service.createUser(undefined, {
        email: 'merchant@example.com',
        sendInvitationEmail: false
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs a warning instead of throwing when revoking a missing API key', async () => {
    const service = buildService();
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    const httpMock = {
      delete: jest.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 404,
          data: { message: 'This apikey does not exists.' }
        }
      })
    };
    (service as any).createHttp = jest.fn().mockReturnValue(httpMock);

    await expect(service.revokeUserApiKey(undefined, 'api-key-9999')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: '****9999',
        statusCode: 404
      }),
      'revokeUserApiKey'
    );
    warnSpy.mockRestore();
  });
});
