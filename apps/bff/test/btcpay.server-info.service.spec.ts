import { BtcpayService } from '../src/btcpay/btcpay.service';
import { BtcpayServerInfoService } from '../src/btcpay/btcpay.server-info.service';

describe('BtcpayServerInfoService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns cached isTestnet result within TTL', async () => {
    const btcpayServiceMock = {
      getServerInfo: jest.fn().mockResolvedValue({ isTestnet: true }),
      resolveBaseUrl: jest.fn().mockImplementation((host?: string) => host ?? 'https://btcpay.example')
    };

    const service = new BtcpayServerInfoService(btcpayServiceMock as unknown as BtcpayService);

    await expect(service.isTestnet()).resolves.toBe(true);
    expect(btcpayServiceMock.getServerInfo).toHaveBeenCalledTimes(1);

    btcpayServiceMock.getServerInfo.mockClear();

    await expect(service.isTestnet()).resolves.toBe(true);
    expect(btcpayServiceMock.getServerInfo).not.toHaveBeenCalled();
  });

  it('refreshes cache after TTL and infers testnet from network type', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const btcpayServiceMock = {
      getServerInfo: jest
        .fn()
        .mockResolvedValueOnce({ networkType: 'mainnet' })
        .mockResolvedValueOnce({ networkType: 'testnet' }),
      resolveBaseUrl: jest.fn().mockImplementation((host?: string) => host ?? 'https://btcpay.example')
    };

    const service = new BtcpayServerInfoService(btcpayServiceMock as unknown as BtcpayService);

    await expect(service.isTestnet()).resolves.toBe(false);
    expect(btcpayServiceMock.getServerInfo).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(Date.now() + 5 * 60 * 1000 + 1));

    await expect(service.isTestnet()).resolves.toBe(true);
    expect(btcpayServiceMock.getServerInfo).toHaveBeenCalledTimes(2);
  });
});
