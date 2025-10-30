import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FeeRateQueryDto,
  ListWalletTransactionsQueryDto,
  ListWalletTxResponse,
  TxDirection,
  TxStatus,
  WalletFeeRate,
  WalletOverview,
  WalletReceiveAddress,
  WalletTx,
  WalletUtxo
} from './dto/wallet-transactions.dto';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { BtcpayWalletService, type ListTransactionsResult } from '../btcpay/btcpay.wallets.service';
import { BtcpayKeysService } from '../btcpay/btcpay.keys.service';
import { normalizeEmail } from '../auth/email.utils';
import { BtcpayServerInfoService } from '../btcpay/btcpay.server-info.service';
import { ListTransactionsQuery } from '../btcpay/btcpay.wallets.service';

interface RequestUserContext {
  id: string | null;
  email: string | null;
}

@Injectable()
export class OnchainWalletReadService {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly btcpayWallets: BtcpayWalletService,
    private readonly keysService: BtcpayKeysService,
    private readonly serverInfo: BtcpayServerInfoService
  ) {}

  async listTransactions(
    user: RequestUserContext,
    storeId: string,
    cryptoCode: string,
    query: ListWalletTransactionsQueryDto
  ): Promise<ListWalletTxResponse> {
    const userId = this.requireUserId(user.id);
    const store = await this.requireStore(userId, storeId);
    const normalizedCrypto = this.normalizeCryptoCode(cryptoCode);

    const btcpayQuery: ListTransactionsQuery = {
      skip: query.skip,
      count: query.count,
      labels: query.labels,
      order: query.order
    };

    let result: ListTransactionsResult;
    try {
      result = await this.btcpayWallets.listTransactions(store.btcpayStoreId, normalizedCrypto, btcpayQuery, {
        store,
        host: store.btcpayHost
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const email = this.requireUserEmail(user.email);
        result = await this.keysService.withStoreSettingsWriteKey(
          store.btcpayStoreId,
          email,
          async (apiKey) =>
            this.btcpayWallets.listTransactions(store.btcpayStoreId, normalizedCrypto, btcpayQuery, {
              store,
              apiKeyOverride: apiKey,
              host: store.btcpayHost
            }),
          { host: store.btcpayHost }
        );
      } else {
        throw error;
      }
    }

    const explorerBase = await this.resolveExplorerBase(store);
    const mapped = result.items
      .map((item) => this.mapTransaction(item, explorerBase))
      .filter((item): item is WalletTx => item !== null);

    const filteredByLabels = this.filterByLabels(mapped, query.labels);
    const filteredByStatus = this.filterByStatus(filteredByLabels, query.status ?? null);
    const sorted = this.sortTransactions(filteredByStatus, query.order);

    return {
      total: typeof result.total === 'number' ? result.total : filteredByStatus.length,
      items: sorted
    } satisfies ListWalletTxResponse;
  }

  async getTransaction(
    user: RequestUserContext,
    storeId: string,
    cryptoCode: string,
    transactionId: string
  ): Promise<WalletTx> {
    const userId = this.requireUserId(user.id);
    const store = await this.requireStore(userId, storeId);
    const normalizedCrypto = this.normalizeCryptoCode(cryptoCode);

    let payload: unknown;
    try {
      payload = await this.btcpayWallets.getTransaction(store.btcpayStoreId, normalizedCrypto, transactionId, {
        store,
        host: store.btcpayHost
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const email = this.requireUserEmail(user.email);
        payload = await this.keysService.withStoreSettingsWriteKey(
          store.btcpayStoreId,
          email,
          async (apiKey) =>
            this.btcpayWallets.getTransaction(store.btcpayStoreId, normalizedCrypto, transactionId, {
              store,
              apiKeyOverride: apiKey,
              host: store.btcpayHost
            }),
          { host: store.btcpayHost }
        );
      } else {
        throw error;
      }
    }

    const explorerBase = await this.resolveExplorerBase(store);
    const mapped = this.mapTransaction(payload, explorerBase);
    if (!mapped) {
      throw new NotFoundException('Transaction data is unavailable.');
    }
    return mapped;
  }

  async getOverview(
    user: RequestUserContext,
    storeId: string,
    cryptoCode: string
  ): Promise<WalletOverview> {
    const userId = this.requireUserId(user.id);
    const store = await this.requireStore(userId, storeId);
    const normalizedCrypto = this.normalizeCryptoCode(cryptoCode);

    let payload: unknown;
    try {
      payload = await this.btcpayWallets.getOverview(store.btcpayStoreId, normalizedCrypto, {
        store,
        host: store.btcpayHost
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const email = this.requireUserEmail(user.email);
        payload = await this.keysService.withStoreSettingsWriteKey(
          store.btcpayStoreId,
          email,
          async (apiKey) =>
            this.btcpayWallets.getOverview(store.btcpayStoreId, normalizedCrypto, {
              store,
              apiKeyOverride: apiKey,
              host: store.btcpayHost
            }),
          { host: store.btcpayHost }
        );
      } else {
        throw error;
      }
    }

    return this.mapOverview(payload);
  }

  async listUtxos(
    user: RequestUserContext,
    storeId: string,
    cryptoCode: string
  ): Promise<WalletUtxo[]> {
    const userId = this.requireUserId(user.id);
    const store = await this.requireStore(userId, storeId);
    const normalizedCrypto = this.normalizeCryptoCode(cryptoCode);

    let payload: unknown[];
    try {
      payload = await this.btcpayWallets.listUtxos(store.btcpayStoreId, normalizedCrypto, {
        store,
        host: store.btcpayHost
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const email = this.requireUserEmail(user.email);
        payload = await this.keysService.withStoreSettingsWriteKey(
          store.btcpayStoreId,
          email,
          async (apiKey) =>
            this.btcpayWallets.listUtxos(store.btcpayStoreId, normalizedCrypto, {
              store,
              apiKeyOverride: apiKey,
              host: store.btcpayHost
            }),
          { host: store.btcpayHost }
        );
      } else {
        throw error;
      }
    }

    return payload.map((item) => this.mapUtxo(item)).filter((item): item is WalletUtxo => item !== null);
  }

  async getReceiveAddress(
    user: RequestUserContext,
    storeId: string,
    cryptoCode: string
  ): Promise<WalletReceiveAddress> {
    const userId = this.requireUserId(user.id);
    const store = await this.requireStore(userId, storeId);
    const normalizedCrypto = this.normalizeCryptoCode(cryptoCode);

    let payload: unknown;
    try {
      payload = await this.btcpayWallets.getReceiveAddress(store.btcpayStoreId, normalizedCrypto, {
        store,
        host: store.btcpayHost
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const email = this.requireUserEmail(user.email);
        payload = await this.keysService.withStoreSettingsWriteKey(
          store.btcpayStoreId,
          email,
          async (apiKey) =>
            this.btcpayWallets.getReceiveAddress(store.btcpayStoreId, normalizedCrypto, {
              store,
              apiKeyOverride: apiKey,
              host: store.btcpayHost
            }),
          { host: store.btcpayHost }
        );
      } else {
        throw error;
      }
    }

    return this.mapReceiveAddress(payload);
  }

  async getFeeRate(
    user: RequestUserContext,
    storeId: string,
    cryptoCode: string,
    query: FeeRateQueryDto
  ): Promise<WalletFeeRate> {
    const userId = this.requireUserId(user.id);
    const store = await this.requireStore(userId, storeId);
    const normalizedCrypto = this.normalizeCryptoCode(cryptoCode);

    let payload: unknown;
    try {
      payload = await this.btcpayWallets.getFeeRate(store.btcpayStoreId, normalizedCrypto, query.blockTarget, {
        store,
        host: store.btcpayHost
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const email = this.requireUserEmail(user.email);
        payload = await this.keysService.withStoreSettingsWriteKey(
          store.btcpayStoreId,
          email,
          async (apiKey) =>
            this.btcpayWallets.getFeeRate(store.btcpayStoreId, normalizedCrypto, query.blockTarget, {
              store,
              apiKeyOverride: apiKey,
              host: store.btcpayHost
            }),
          { host: store.btcpayHost }
        );
      } else {
        throw error;
      }
    }

    return this.mapFeeRate(payload, query.blockTarget);
  }

  private mapTransaction(payload: unknown, explorerBase: string | null): WalletTx | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as Record<string, unknown>;
    const txId = this.extractHash(record.transactionHash ?? record.txId ?? record.transactionId);
    if (!txId) {
      return null;
    }

    const timestamp = this.extractTimestamp(record.timestamp);
    const confirmations = this.extractInteger(record.confirmations);
    const status = this.resolveStatus(record.status, confirmations);
    const amount = this.extractAmount(record);
    const direction = this.resolveDirection(amount);
    const fee = this.extractFee(record);
    const rateUsd = this.extractRateUsd(record, amount);
    const labels = this.extractLabels(record);
    const comment = this.extractComment(record);
    const explorerUrl = this.resolveExplorerUrl(record, explorerBase, txId);

    return {
      txId,
      timestamp,
      confirmations,
      status,
      direction,
      amount,
      fee,
      rateUsd,
      labels,
      comment,
      blockExplorerUrl: explorerUrl ?? undefined
    } satisfies WalletTx;
  }

  private mapOverview(payload: unknown): WalletOverview {
    if (!payload || typeof payload !== 'object') {
      return {
        balance: '0',
        confirmedBalance: '0',
        unconfirmedBalance: '0'
      } satisfies WalletOverview;
    }

    const record = payload as Record<string, unknown>;
    return {
      balance: this.extractMoneyValue(record.balance) ?? '0',
      confirmedBalance: this.extractMoneyValue(record.confirmedBalance) ?? '0',
      unconfirmedBalance: this.extractMoneyValue(record.unconfirmedBalance) ?? '0',
      label: this.extractString(record.label)
    } satisfies WalletOverview;
  }

  private mapUtxo(payload: unknown): WalletUtxo | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as Record<string, unknown>;
    const outpoint = this.extractString(record.outpoint) ?? this.extractString(record.outPoint);
    const amount = this.extractMoneyValue(record.amount);
    const address = this.extractString(record.address);
    if (!outpoint || !amount || !address) {
      return null;
    }

    return {
      outpoint,
      amount,
      address,
      keyPath: this.extractString(record.keyPath),
      comment: this.extractComment(record),
      labels: this.extractLabels(record),
      confirmations: this.extractInteger(record.confirmations),
      timestamp: this.extractTimestamp(record.timestamp),
      link: this.extractString(record.link)
    } satisfies WalletUtxo;
  }

  private mapReceiveAddress(payload: unknown): WalletReceiveAddress {
    if (!payload || typeof payload !== 'object') {
      return { address: '', keyPath: null, paymentLink: null } satisfies WalletReceiveAddress;
    }

    const record = payload as Record<string, unknown>;
    return {
      address: this.extractString(record.address) ?? '',
      keyPath: this.extractString(record.keyPath),
      paymentLink: this.extractString(record.paymentLink)
    } satisfies WalletReceiveAddress;
  }

  private mapFeeRate(payload: unknown, blockTarget?: number): WalletFeeRate {
    if (!payload || typeof payload !== 'object') {
      return { feeRate: '0', blockTarget: blockTarget ?? null } satisfies WalletFeeRate;
    }

    const record = payload as Record<string, unknown>;
    const feeRateCandidate = record.feeRate ?? record.rate ?? record.satoshiPerByte;
    const feeRate = this.extractFeeRateValue(feeRateCandidate);
    return {
      feeRate: feeRate ?? '0',
      blockTarget: typeof blockTarget === 'number' ? blockTarget : null
    } satisfies WalletFeeRate;
  }

  private filterByLabels(items: WalletTx[], labels: string[]): WalletTx[] {
    if (!Array.isArray(labels) || labels.length === 0) {
      return items;
    }

    const normalized = labels.map((label) => label.toLowerCase());
    return items.filter((item) => {
      const txLabels = item.labels.map((label) => label.toLowerCase());
      return normalized.every((needle) => txLabels.includes(needle));
    });
  }

  private filterByStatus(items: WalletTx[], status: TxStatus | null): WalletTx[] {
    if (!status) {
      return items;
    }

    return items.filter((item) => item.status === status);
  }

  private sortTransactions(items: WalletTx[], order: 'asc' | 'desc'): WalletTx[] {
    const sorted = [...items];
    sorted.sort((a, b) => {
      const aTime = Date.parse(a.timestamp);
      const bTime = Date.parse(b.timestamp);
      return order === 'asc' ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }

  private resolveExplorerBase(store: ManagedStoreEntity): Promise<string | null> {
    return this.serverInfo.isTestnet(store.btcpayHost).then((isTestnet) =>
      isTestnet ? 'https://mempool.space/testnet/tx/{0}' : 'https://mempool.space/tx/{0}'
    );
  }

  private resolveExplorerUrl(
    record: Record<string, unknown>,
    base: string | null,
    txId: string
  ): string | null {
    const direct = this.extractString(record.link ?? record.blockExplorerUrl ?? record.transactionLink);
    if (direct) {
      return direct;
    }
    if (!base) {
      return null;
    }
    if (base.includes('{0}')) {
      return base.replace('{0}', txId);
    }
    if (base.endsWith('/')) {
      return `${base}${txId}`;
    }
    return `${base}/${txId}`;
  }

  private extractHash(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return null;
  }

  private extractTimestamp(value: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return this.normalizeTimestampFromNumber(numeric);
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return this.normalizeTimestampFromNumber(value);
    }

    return new Date(0).toISOString();
  }

  private normalizeTimestampFromNumber(value: number): string {
    const ms = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }

  private extractInteger(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
      }
    }
    return 0;
  }

  private resolveStatus(value: unknown, confirmations: number): TxStatus {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'confirmed') {
        return 'confirmed';
      }
      if (normalized === 'unconfirmed') {
        return 'unconfirmed';
      }
      if (normalized.includes('double')) {
        return 'double-spent';
      }
      if (normalized.includes('replace')) {
        return 'replaced';
      }
    }

    return confirmations > 0 ? 'confirmed' : 'unconfirmed';
  }

  private extractAmount(record: Record<string, unknown>): string {
    const candidates: unknown[] = [
      record.amount,
      record.balanceChange,
      record.balance,
      record.value,
      record.amountValue
    ];

    for (const candidate of candidates) {
      const value = this.extractMoneyValue(candidate);
      if (value !== null) {
        return value;
      }

      if (candidate && typeof candidate === 'object') {
        const nested = (candidate as Record<string, unknown>).value;
        const nestedValue = this.extractMoneyValue(nested);
        if (nestedValue !== null) {
          return nestedValue;
        }
      }
    }

    return '0';
  }

  private extractFee(record: Record<string, unknown>): string | null {
    const candidates: unknown[] = [record.fee, record.miningFee];
    for (const candidate of candidates) {
      const value = this.extractMoneyValue(candidate);
      if (value !== null) {
        return value;
      }

      if (candidate && typeof candidate === 'object') {
        const nested = (candidate as Record<string, unknown>).value;
        const nestedValue = this.extractMoneyValue(nested);
        if (nestedValue !== null) {
          return nestedValue;
        }
      }
    }
    return null;
  }

  private extractRateUsd(record: Record<string, unknown>, amount: string): number | null {
    const directCandidates: unknown[] = [record.rateUsd, record.usdRate, record.rateUSD];
    for (const candidate of directCandidates) {
      const numeric = this.extractNumeric(candidate);
      if (numeric !== null) {
        return numeric;
      }
    }

    const amountFiatCandidates: unknown[] = [record.amountFiat, record.fiatAmount, record.fiatValue];
    for (const candidate of amountFiatCandidates) {
      const fiat = this.extractMoneyValue(candidate);
      if (fiat !== null) {
        const rate = this.computeRateFromAmounts(amount, fiat);
        if (rate !== null) {
          return rate;
        }
      }
      if (candidate && typeof candidate === 'object') {
        const nested = (candidate as Record<string, unknown>).value;
        const fiat = this.extractMoneyValue(nested);
        if (fiat !== null) {
          const rate = this.computeRateFromAmounts(amount, fiat);
          if (rate !== null) {
            return rate;
          }
        }
      }
    }

    const rates = record.rates;
    if (rates && typeof rates === 'object') {
      const usd = (rates as Record<string, unknown>).USD ?? (rates as Record<string, unknown>).usd;
      const numeric = this.extractNumeric(usd);
      if (numeric !== null) {
        return numeric;
      }
      if (usd && typeof usd === 'object') {
        const value = this.extractNumeric((usd as Record<string, unknown>).value);
        if (value !== null) {
          return value;
        }
      }
    }

    return null;
  }

  private computeRateFromAmounts(amountBtc: string, amountFiat: string): number | null {
    const btc = Number(amountBtc);
    const fiat = Number(amountFiat);
    if (!Number.isFinite(btc) || btc === 0 || !Number.isFinite(fiat)) {
      return null;
    }
    const rate = fiat / Math.abs(btc);
    return Number.isFinite(rate) ? rate : null;
  }

  private extractLabels(record: Record<string, unknown>): string[] {
    const labels: string[] = [];
    const seen = new Set<string>();

    const source = record.labels ?? record.labelColors ?? record.label;
    if (!source) {
      return labels;
    }

    if (Array.isArray(source)) {
      for (const entry of source) {
        const candidate = this.extractLabelValue(entry);
        if (candidate && !seen.has(candidate.toLowerCase())) {
          seen.add(candidate.toLowerCase());
          labels.push(candidate);
        }
      }
      return labels;
    }

    if (typeof source === 'object') {
      for (const value of Object.values(source as Record<string, unknown>)) {
        const candidate = this.extractLabelValue(value);
        if (candidate && !seen.has(candidate.toLowerCase())) {
          seen.add(candidate.toLowerCase());
          labels.push(candidate);
        }
      }
    } else if (typeof source === 'string') {
      const candidate = source.trim();
      if (candidate) {
        labels.push(candidate);
      }
    }

    return labels;
  }

  private extractLabelValue(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const text = this.extractString(record.text ?? record.label ?? record.value);
      if (text) {
        return text;
      }
    }
    return null;
  }

  private extractComment(record: Record<string, unknown>): string | null {
    return this.extractString(record.comment);
  }

  private extractMoneyValue(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return null;
  }

  private extractNumeric(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private extractString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }

  private extractFeeRateValue(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const perByte = record.satoshiPerByte ?? record.satsPerByte ?? record.value;
      return this.extractFeeRateValue(perByte);
    }
    return null;
  }

  private resolveDirection(amount: string): TxDirection {
    const numeric = Number(amount);
    if (Number.isFinite(numeric) && numeric < 0) {
      return 'out';
    }
    return 'in';
  }

  private normalizeCryptoCode(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed ? trimmed.toUpperCase() : 'BTC';
  }

  private requireUserId(value: string | null): string {
    if (!value || typeof value !== 'string') {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    return trimmed;
  }

  private requireUserEmail(value: string | null): string {
    const normalized = normalizeEmail(value ?? '');
    if (!normalized) {
      throw new UnauthorizedException('BTCPay user email is required.');
    }
    return normalized;
  }

  private async requireStore(userId: string, storeId: string): Promise<ManagedStoreEntity> {
    const trimmed = storeId.trim();
    if (!trimmed) {
      throw new NotFoundException('Store not found');
    }
    const store = await this.storesRepository.findOne({
      where: [
        { btcpayStoreId: trimmed, userId },
        { id: trimmed, userId }
      ]
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return store;
  }
}
