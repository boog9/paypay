import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { wordlists } from 'bip39';
import { BtcpayService, type BtcpayServerInfoResponse } from '../btcpay/btcpay.service';
import { SENSITIVE_ERROR_MESSAGE } from './dto/preview-onchain.dto';

interface PreviewRequestBody {
  derivationScheme?: unknown;
  descriptor?: unknown;
  accountKeyPath?: unknown;
  label?: unknown;
  config?: PreviewRequestBody;
}

interface NormalizedPreviewRequest {
  derivationScheme: string;
  accountKeyPath?: string;
  label?: string;
}

interface PreviewOptions {
  requestId?: string;
}

type BitcoinNetwork = 'mainnet' | 'testnet';

const TESTNET_EXTENDED_KEY_PREFIXES = new Set(['tpub', 'upub', 'vpub']);
const MAINNET_EXTENDED_KEY_PREFIXES = new Set(['xpub', 'ypub', 'zpub']);
const EXTENDED_KEY_REGEX = /^(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/iu;
const BIP39_WORD_SET = new Set<string>(
  Array.isArray(wordlists.english)
    ? (wordlists.english as unknown[])
        .filter((word): word is string => typeof word === 'string')
        .map((word) => word.toLowerCase())
    : []
);

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

@Injectable()
export class WalletPreviewService {
  constructor(private readonly btcpay: BtcpayService) {}

  async previewOnchainProposedConfig(storeId: string, body: unknown, options?: PreviewOptions) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const normalized = this.normalizePreviewRequest(body);
    const network = await this.fetchServerNetwork(normalizedStoreId, options?.requestId);
    this.validateNetwork(normalized.derivationScheme, network);
    let accountKeyPath: string | undefined;

    if (normalized.accountKeyPath !== undefined) {
      accountKeyPath = this.normalizeAccountKeyPath(normalized.accountKeyPath, network);
    } else if (this.isExtendedPublicKey(normalized.derivationScheme)) {
      accountKeyPath = this.defaultAccountKeyPath(network);
    }

    const payload: Record<string, unknown> = {
      derivationScheme: normalized.derivationScheme,
      count: 10,
    };

    if (accountKeyPath) {
      payload.accountKeyPath = accountKeyPath;
    }
    if (normalized.label) {
      payload.label = normalized.label;
    }

    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'POST',
      path: this.buildPreviewPath(normalizedStoreId),
      data: payload,
      requestId: options?.requestId
    });
  }

  private normalizePreviewRequest(body: unknown): NormalizedPreviewRequest {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Preview payload must be a JSON object.');
    }

    const payload = body as PreviewRequestBody;
    const source = this.unwrapConfig(payload);

    const descriptorCandidate = normalizeString(source.descriptor);
    const derivationCandidate = normalizeString(source.derivationScheme);
    const accountKeyPathCandidate = normalizeString(source.accountKeyPath);
    const labelCandidate = normalizeString(source.label);

    const label = this.normalizeLabel(labelCandidate);

    const derivationSource = derivationCandidate || descriptorCandidate;
    if (!derivationSource) {
      throw new BadRequestException('derivationScheme is required.');
    }

    const derivationScheme = this.normalizeDerivationSchemeInput(derivationSource);
    if (accountKeyPathCandidate) {
      this.assertNoSensitiveSecrets(accountKeyPathCandidate);
    }
    const accountKeyPath = accountKeyPathCandidate.length > 0 ? accountKeyPathCandidate : undefined;

    return label
      ? { derivationScheme, accountKeyPath, label }
      : { derivationScheme, accountKeyPath };
  }

  private unwrapConfig(payload: PreviewRequestBody): PreviewRequestBody {
    if (payload.config && typeof payload.config === 'object' && !Array.isArray(payload.config)) {
      return payload.config;
    }
    return payload;
  }

  private normalizeLabel(value: string): string | undefined {
    if (!value) {
      return undefined;
    }
    if (value.length > 120) {
      throw new BadRequestException('Label must not exceed 120 characters.');
    }
    this.assertNoSensitiveSecrets(value);
    return value;
  }

  private normalizeAccountKeyPath(value: string, network: BitcoinNetwork): string {
    const compact = value.replace(/\s+/gu, '');
    const normalized = compact.replace(/^m\//iu, '').replace(/^M\//u, '');
    const result = `m/${normalized}`;
    const match = result.match(/^m\/(84|86)'\/([01])'\/(\d+)'$/u);
    if (!match) {
      throw new UnprocessableEntityException(
        "Account key path must follow m/84'/coin'/account' or m/86'/coin'/account'."
      );
    }

    const coinType = match[2];
    const expectedCoinType = network === 'testnet' ? '1' : '0';
    if (coinType !== expectedCoinType) {
      throw new UnprocessableEntityException('Account key path does not match the BTCPay network.');
    }

    this.assertNoSensitiveSecrets(result);
    return result;
  }

  private defaultAccountKeyPath(network: BitcoinNetwork): string {
    const coinType = network === 'testnet' ? "1" : "0";
    return `m/84'/${coinType}'/0'`;
  }

  private assertNoSensitiveSecrets(value: string): void {
    if (!value) {
      return;
    }

    const lowered = value.toLowerCase();
    const forbidden = ['seed', 'mnemonic', 'bip39', 'xprv', 'yprv', 'zprv', 'privatekey'];
    if (forbidden.some((token) => lowered.includes(token))) {
      throw new BadRequestException(SENSITIVE_ERROR_MESSAGE);
    }

    const words = lowered.split(/[^a-z]/u).filter((segment) => segment.length > 0);
    let matches = 0;
    for (const word of words) {
      if (BIP39_WORD_SET.has(word)) {
        matches += 1;
        if (matches >= 3) {
          throw new BadRequestException(SENSITIVE_ERROR_MESSAGE);
        }
      }
    }
  }

  private normalizeStoreId(value: string): string {
    const trimmed = normalizeString(value);
    if (!trimmed) {
      throw new BadRequestException('Store identifier is required');
    }
    return trimmed;
  }

  private buildPreviewPath(storeId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/BTC-CHAIN/wallet/preview`;
  }

  private normalizeDerivationSchemeInput(value: string): string {
    const trimmed = value.trim();
    const withoutComments = trimmed.replace(/#.*/u, '');
    const compact = withoutComments.replace(/\s+/gu, '');
    if (!compact) {
      throw new BadRequestException('derivationScheme must be a non-empty string.');
    }
    this.assertNoSensitiveSecrets(compact);
    if (/^(wpkh|sh|pkh|wsh|tr|sortedmulti)\(/iu.test(compact)) {
      return this.sanitizeDescriptor(compact);
    }
    return compact;
  }

  private sanitizeDescriptor(value: string): string {
    const withoutWhitespace = value.replace(/\s+/gu, '');
    const hashIndex = withoutWhitespace.indexOf('#');
    const withoutComments = hashIndex >= 0 ? withoutWhitespace.slice(0, hashIndex) : withoutWhitespace;
    return withoutComments.replace(/\[([0-9a-fA-F]{8})([^\]]*)/g, (_match, fp: string, rest: string) => {
      return `[${fp.toUpperCase()}${rest}`;
    });
  }

  private isExtendedPublicKey(value: string): boolean {
    return EXTENDED_KEY_REGEX.test(value.trim());
  }

  private validateNetwork(derivationScheme: string, network: BitcoinNetwork): void {
    const prefixes = this.extractExtendedKeyPrefixes(derivationScheme);
    if (prefixes.size === 0) {
      return;
    }

    for (const prefix of prefixes) {
      if (!TESTNET_EXTENDED_KEY_PREFIXES.has(prefix) && !MAINNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
        throw new UnprocessableEntityException('Unsupported extended public key format.');
      }
      if (network === 'testnet' && MAINNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
        throw new UnprocessableEntityException('Network mismatch: testnet instance cannot accept mainnet extended keys.');
      }
      if (network === 'mainnet' && TESTNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
        throw new UnprocessableEntityException('Network mismatch: mainnet instance cannot accept testnet extended keys.');
      }
    }
  }

  private extractExtendedKeyPrefixes(value: string): Set<string> {
    const prefixes = new Set<string>();
    const regex = /(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+/giu;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      const prefix = match[1]?.slice(0, 4).toLowerCase();
      if (prefix) {
        prefixes.add(prefix);
      }
    }
    return prefixes;
  }

  private async fetchServerNetwork(storeId: string, requestId?: string): Promise<BitcoinNetwork> {
    const info = await this.btcpay.proxy<BtcpayServerInfoResponse>({
      storeId,
      method: 'GET',
      path: '/api/v1/server/info',
      requestId,
    });

    return this.resolveNetwork(info);
  }

  private resolveNetwork(info: BtcpayServerInfoResponse | null | undefined): BitcoinNetwork {
    if (info?.isTestnet === true) {
      return 'testnet';
    }
    if (info?.isTestnet === false) {
      return 'mainnet';
    }
    const candidate = (info?.networkType ?? info?.network ?? '').toString().toLowerCase();
    if (candidate.includes('test')) {
      return 'testnet';
    }
    return 'mainnet';
  }
}
