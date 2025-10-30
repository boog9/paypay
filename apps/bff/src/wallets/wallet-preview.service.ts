import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException
} from '@nestjs/common';
import { wordlists } from 'bip39';
import { HDKey } from '@scure/bip32';
import { BtcpayService } from '../btcpay/btcpay.service';
import { SENSITIVE_ERROR_MESSAGE } from './dto/preview-onchain.dto';

interface PreviewRequestBody {
  derivationScheme?: unknown;
  descriptor?: unknown;
  accountKeyPath?: unknown;
  label?: unknown;
  masterFingerprint?: unknown;
  rootFingerprint?: unknown;
  config?: PreviewRequestBody;
}

interface NormalizedPreviewRequest {
  descriptor: string;
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

function toHex(value: number): string {
  return value.toString(16).padStart(8, '0').toUpperCase();
}

@Injectable()
export class WalletPreviewService {
  constructor(private readonly btcpay: BtcpayService) {}

  async previewOnchainProposedConfig(storeId: string, body: unknown, options?: PreviewOptions) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const normalized = this.normalizePreviewRequest(body);

    const payload: Record<string, unknown> = {
      descriptor: normalized.descriptor,
      accountKeyPath: normalized.accountKeyPath
    };

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
    const fingerprintCandidate = normalizeString(source.masterFingerprint || source.rootFingerprint);

    const label = this.normalizeLabel(labelCandidate);

    if (!descriptorCandidate && !derivationCandidate) {
      throw new BadRequestException('descriptor or derivationScheme is required.');
    }

    const result = descriptorCandidate
      ? this.normalizeDescriptor(descriptorCandidate, accountKeyPathCandidate, fingerprintCandidate)
      : this.normalizeDerivationScheme(derivationCandidate, accountKeyPathCandidate, fingerprintCandidate);

    return label ? { ...result, label } : result;
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

  private normalizeDescriptor(
    rawDescriptor: string,
    accountKeyPathCandidate: string,
    fingerprintCandidate: string
  ): NormalizedPreviewRequest {
    const sanitized = this.sanitizeDescriptor(rawDescriptor);
    this.assertNoSensitiveSecrets(sanitized);

    const match = sanitized.match(
      /^wpkh\(\[(?<details>[^\]]*)\](?<extended>(?:tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+)\/(?<branch>0)\/\*\)$/iu
    );

    if (!match || !match.groups) {
      throw new UnprocessableEntityException(
        "Descriptor must follow wpkh([FPR/84'/1'/0']tpub.../0/*) with a testnet extended key."
      );
    }

    const extendedKey = match.groups.extended;
    this.ensureTestnetExtendedKey(extendedKey);

    const details = match.groups.details ?? '';
    const { fingerprintFromDescriptor, accountPathFromDescriptor } = this.extractDescriptorDetails(details);

    const accountKeyPath = this.normalizeAccountKeyPath(
      accountKeyPathCandidate || accountPathFromDescriptor || ''
    );

    const fingerprint = this.resolveFingerprint(
      fingerprintCandidate || fingerprintFromDescriptor || '',
      extendedKey
    );

    const descriptorPath = accountKeyPath.replace(/^m\//iu, '');
    const descriptor = `wpkh([${fingerprint}/${descriptorPath}]${extendedKey}/0/*)`;

    return {
      descriptor,
      accountKeyPath
    };
  }

  private normalizeDerivationScheme(
    derivationScheme: string,
    accountKeyPathCandidate: string,
    fingerprintCandidate: string
  ): NormalizedPreviewRequest {
    const trimmed = derivationScheme;
    this.assertNoSensitiveSecrets(trimmed);

    if (/^wpkh\(/iu.test(trimmed)) {
      return this.normalizeDescriptor(trimmed, accountKeyPathCandidate, fingerprintCandidate);
    }

    const prefix = trimmed.slice(0, 4).toLowerCase();
    if (MAINNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Testnet wallets must use tpub, upub, or vpub extended keys.');
    }
    if (!TESTNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Unsupported extended public key format.');
    }

    const accountKeyPath = this.normalizeAccountKeyPath(accountKeyPathCandidate);
    const fingerprint = this.resolveFingerprint(fingerprintCandidate, trimmed);
    const descriptorPath = accountKeyPath.replace(/^m\//iu, '');
    const descriptor = `wpkh([${fingerprint}/${descriptorPath}]${trimmed}/0/*)`;

    return {
      descriptor,
      accountKeyPath
    };
  }

  private sanitizeDescriptor(value: string): string {
    const trimmed = value.replace(/\s+/gu, '');
    return trimmed.replace(/#.+$/u, '');
  }

  private extractDescriptorDetails(details: string): {
    fingerprintFromDescriptor?: string;
    accountPathFromDescriptor?: string;
  } {
    if (!details) {
      return {};
    }

    const segments = details.split('/').filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      return {};
    }

    let fingerprintFromDescriptor: string | undefined;
    let pathSegments = segments;

    if (/^[0-9a-fA-F]{8}$/.test(segments[0] ?? '')) {
      fingerprintFromDescriptor = segments[0]!.toUpperCase();
      pathSegments = segments.slice(1);
    }

    if (pathSegments.length === 0) {
      return { fingerprintFromDescriptor };
    }

    const path = pathSegments.join('/');
    return {
      fingerprintFromDescriptor,
      accountPathFromDescriptor: `m/${path}`
    };
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

  private resolveFingerprint(provided: string, extendedKey: string): string {
    const normalized = this.normalizeFingerprint(provided);
    if (normalized) {
      return normalized;
    }

    const derived = this.deriveFingerprint(extendedKey);
    if (derived) {
      return derived;
    }

    throw new BadRequestException('Unable to determine master fingerprint from extended key.');
  }

  private normalizeFingerprint(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (!/^[0-9a-fA-F]{8}$/u.test(trimmed)) {
      throw new BadRequestException('Master fingerprint must be 8 hexadecimal characters.');
    }
    return trimmed.toUpperCase();
  }

  private deriveFingerprint(extendedKey: string): string | null {
    try {
      const key = HDKey.fromExtendedKey(extendedKey);
      const fp = key.fingerprint;
      if (typeof fp === 'number') {
        return toHex(fp);
      }
      if (typeof key.parentFingerprint === 'number') {
        return toHex(key.parentFingerprint);
      }
    } catch {
      return null;
    }
    return null;
  }

  private ensureTestnetExtendedKey(value: string): void {
    const prefix = value.slice(0, 4).toLowerCase();
    if (MAINNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Testnet descriptors must not contain mainnet extended keys.');
    }
    if (!TESTNET_EXTENDED_KEY_PREFIXES.has(prefix)) {
      throw new UnprocessableEntityException('Unsupported extended public key format in descriptor.');
    }
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
}
