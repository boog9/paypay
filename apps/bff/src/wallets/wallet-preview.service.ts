import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { wordlists } from 'bip39';
import { BtcpayService } from '../btcpay/btcpay.service';
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
  accountKeyPath: string;
  label?: string;
}

interface PreviewOptions {
  requestId?: string;
}

const DEFAULT_ACCOUNT_KEY_PATH = "m/84'/1'/0'";
const TESTNET_EXTENDED_KEY_PREFIXES = new Set(['tpub', 'upub', 'vpub']);
const MAINNET_EXTENDED_KEY_PREFIXES = new Set(['xpub', 'ypub', 'zpub']);
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

    return this.btcpay.proxy({
      storeId: normalizedStoreId,
      method: 'GET',
      path: this.buildPreviewPath(normalizedStoreId),
      params: this.buildPreviewParams(normalized),
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

    if (!descriptorCandidate && !derivationCandidate) {
      throw new BadRequestException('descriptor or derivationScheme is required.');
    }

    const derivationScheme = this.normalizeDerivationSchemeInput(
      descriptorCandidate || derivationCandidate
    );
    const accountKeyPath = this.resolveAccountKeyPath(
      derivationScheme,
      accountKeyPathCandidate
    );

    this.validateNetwork(derivationScheme);

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

  private normalizeAccountKeyPath(value: string): string {
    const candidate = value ? value : '';
    const withoutPrefix = candidate ? candidate.replace(/^m\//iu, '') : '';
    const fallback = DEFAULT_ACCOUNT_KEY_PATH.replace(/^m\//iu, '');
    const normalizedPath = withoutPrefix || fallback;
    const result = `m/${normalizedPath}`;

    if (!/^m\/(84|86)'\/1'\/\d+'$/iu.test(result)) {
      throw new UnprocessableEntityException(
        "Account key path must follow m/84'/1'/account' or m/86'/1'/account'."
      );
    }

    return result;
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

  private buildPreviewParams(request: NormalizedPreviewRequest): Record<string, string> {
    const params: Record<string, string> = {
      derivationScheme: request.derivationScheme,
      count: '10'
    };
    if (request.accountKeyPath) {
      params.accountKeyPath = request.accountKeyPath;
    }
    if (request.label) {
      params.label = request.label;
    }
    return params;
  }

  private normalizeDerivationSchemeInput(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('derivationScheme must be a non-empty string.');
    }
    this.assertNoSensitiveSecrets(trimmed);
    if (/^wpkh\(/iu.test(trimmed)) {
      return this.sanitizeDescriptor(trimmed);
    }
    return trimmed;
  }

  private sanitizeDescriptor(value: string): string {
    const withoutWhitespace = value.replace(/\s+/gu, '');
    const withoutComments = withoutWhitespace.replace(/#.+$/u, '');
    return withoutComments.replace(/\[([0-9a-fA-F]{8})([^\]]*)/u, (_match, fp: string, rest: string) => {
      return `[${fp.toUpperCase()}${rest}`;
    });
  }

  private resolveAccountKeyPath(derivationScheme: string, provided: string): string {
    if (provided) {
      return this.normalizeAccountKeyPath(provided);
    }

    const inferred = this.extractAccountKeyPathFromDescriptor(derivationScheme);
    if (inferred) {
      return this.normalizeAccountKeyPath(inferred);
    }

    return this.normalizeAccountKeyPath('');
  }

  private extractAccountKeyPathFromDescriptor(descriptor: string): string | null {
    const match = descriptor.match(/\[([^\]]+)\]/u);
    if (!match) {
      return null;
    }

    const details = match[1] ?? '';
    if (!details) {
      return null;
    }

    const segments = details.split('/').filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      return null;
    }

    const [, ...pathSegments] = /^[0-9a-fA-F]{8}$/u.test(segments[0] ?? '')
      ? segments
      : [null, ...segments];

    if (pathSegments.length === 0) {
      return null;
    }

    return `m/${pathSegments.join('/')}`;
  }

  private validateNetwork(derivationScheme: string): void {
    const prefix = derivationScheme.slice(0, 4).toLowerCase();
    if (/^wpkh\(/iu.test(derivationScheme)) {
      const match = derivationScheme.match(/\]([a-z0-9]+)\//iu);
      if (match && match[1]) {
        this.ensureTestnetKeyPrefix(match[1]);
      }
      return;
    }

    if (!derivationScheme) {
      return;
    }

    if (MAINNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Testnet wallets must not use mainnet extended keys.');
    }

    if (!TESTNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Unsupported extended public key format.');
    }
  }

  private ensureTestnetKeyPrefix(prefixCandidate: string): void {
    const prefix = prefixCandidate.slice(0, 4).toLowerCase();
    if (MAINNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Testnet descriptors must not contain mainnet extended keys.');
    }
    if (!TESTNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Unsupported extended public key format in descriptor.');
    }
  }
}
