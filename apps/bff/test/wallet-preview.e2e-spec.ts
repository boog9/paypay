import { HttpException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { UserEntity } from '../src/auth/entities/user.entity';

function readCsrfToken(response: request.Response): string {
  const token = response.headers['x-csrf-token'];
  if (typeof token !== 'string') {
    throw new Error('Expected x-csrf-token header to be present.');
  }
  return token;
}

describe('Wallet preview controller (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  let usersRepository: Repository<UserEntity>;
  let storesRepository: Repository<ManagedStoreEntity>;
  const previewOnchainAddresses = jest.fn();

  const previewResponse = {
    addresses: Array.from({ length: 5 }, (_, index) => `tb1qpreview${index}`)
  };

  const storeIds = ['store-123', 'store-extended', 'store-invalid', 'store-upstream'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BtcpayPaymentMethodsService)
      .useValue({
        previewOnchainAddresses
      })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: false, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer();
    agent = request.agent(server);

    usersRepository = moduleRef.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
    storesRepository = moduleRef.get<Repository<ManagedStoreEntity>>(getRepositoryToken(ManagedStoreEntity));

    const user = usersRepository.create({
      email: 'merchant@example.com',
      passwordHash: 'hash',
      btcpayUserId: 'btcpay-user-id',
      btcpayApiKeyHash: null,
      btcpayApiKeyLabel: null,
      btcpayApiKeyPermissions: null
    });
    const persistedUser = await usersRepository.save(user);

    for (const identifier of storeIds) {
      const entity = storesRepository.create({
        userId: persistedUser.id,
        btcpayStoreId: identifier,
        btcpayHost: 'https://btcpay.example',
        storeName: `Store ${identifier}`,
        defaultCurrency: 'USD',
        apiKeyCiphertext: 'cipher',
        apiKeyDekWrapped: 'dek',
        webhookId: null,
        webhookSecretCiphertext: null,
        webhookSecretDekWrapped: null,
        storeKeyLastFour: null,
        lastActiveAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await storesRepository.save(entity);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    previewOnchainAddresses.mockResolvedValue(previewResponse);
  });

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    return readCsrfToken(response);
  }

  it('forwards descriptor preview requests to BTCPay', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-123';
    const descriptor = "wpkh([abcd1234/84'/1'/0']tpubExampleKey/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-preview-descriptor')
      .send({ derivationScheme: descriptor })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(previewOnchainAddresses).toHaveBeenCalledTimes(1);
    expect(previewOnchainAddresses).toHaveBeenCalledWith(
      expect.objectContaining({ btcpayStoreId: storeId }),
      {
        derivationScheme: descriptor,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      }
    );
  });

  it('builds descriptors from extended public keys', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-extended';
    const extendedKey = 'tpubD6NzVbkrYhZ4YExampleExtendedKey123456789ABCDEFGHJKLMN';

    await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ extendedPublicKey: extendedKey })
      .expect(200);

    expect(previewOnchainAddresses).toHaveBeenCalledWith(
      expect.objectContaining({ btcpayStoreId: storeId }),
      {
        derivationScheme: `wpkh([00000000/84'/1'/0']${extendedKey}/0/*)`,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: null,
        label: null
      }
    );
  });

  it('validates that either descriptor or extended key is provided', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-invalid';

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({})
      .expect(422);

    expect(response.body).toMatchObject({
      message: expect.stringMatching(/descriptor/i)
    });
  });

  it('propagates upstream errors from BTCPay', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-upstream';
    previewOnchainAddresses.mockImplementationOnce(() => {
      throw new HttpException('Upstream error', 502);
    });

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ derivationScheme: "wpkh([abcd1234/84'/1'/0']tpubKey/0/*)" })
      .expect(502);

    expect(response.body).toMatchObject({ message: 'Upstream error' });
  });
});
