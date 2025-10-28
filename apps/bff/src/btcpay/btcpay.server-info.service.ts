import { Injectable } from '@nestjs/common';
import { BtcpayService, type BtcpayServerInfoResponse } from './btcpay.service';

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

@Injectable()
export class BtcpayServerInfoService {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly btcpayService: BtcpayService) {}

  async isTestnet(host?: string): Promise<boolean> {
    const cacheKey = this.buildCacheKey(host);
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const info = await this.btcpayService.getServerInfo(host);
    const isTestnet = this.resolveIsTestnet(info);

    this.cache.set(cacheKey, {
      value: isTestnet,
      expiresAt: now + BtcpayServerInfoService.CACHE_TTL_MS
    });

    return isTestnet;
  }

  private buildCacheKey(host?: string): string {
    return this.btcpayService.resolveBaseUrl(host);
  }

  private resolveIsTestnet(info: BtcpayServerInfoResponse | undefined): boolean {
    if (info && typeof info.isTestnet === 'boolean') {
      return info.isTestnet;
    }

    const network =
      (info?.networkType && typeof info.networkType === 'string'
        ? info.networkType
        : info?.network && typeof info.network === 'string'
          ? info.network
          : '') ?? '';

    if (!network) {
      return false;
    }

    return /(testnet|regtest)/i.test(network);
  }
}
