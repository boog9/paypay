import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type TxDirection = 'in' | 'out';
export type TxStatus = 'confirmed' | 'unconfirmed' | 'replaced' | 'double-spent';

export interface WalletTx {
  txId: string;
  timestamp: string;
  confirmations: number;
  status: TxStatus;
  direction: TxDirection;
  amount: string;
  fee?: string | null;
  rateUsd?: number | null;
  labels: string[];
  comment?: string | null;
  blockExplorerUrl?: string;
}

export interface ListWalletTxResponse {
  total?: number;
  items: WalletTx[];
}

export interface WalletOverview {
  balance: string;
  confirmedBalance: string;
  unconfirmedBalance: string;
  label?: string | null;
}

export interface WalletUtxo {
  outpoint: string;
  amount: string;
  address: string;
  keyPath?: string | null;
  comment?: string | null;
  labels: string[];
  confirmations: number;
  timestamp?: string | null;
  link?: string | null;
}

export interface WalletReceiveAddress {
  address: string;
  keyPath?: string | null;
  paymentLink?: string | null;
}

export interface WalletFeeRate {
  feeRate: string;
  blockTarget?: number | null;
}

export class ListWalletTransactionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  })
  @IsInt()
  @Min(0)
  skip = 0;

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 50;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  count = 50;

  @IsOptional()
  @Transform(({ value }) => normalizeLabels(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  labels: string[] = [];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    return normalized ? normalized : undefined;
  })
  @IsIn(['confirmed', 'unconfirmed', 'replaced', 'double-spent'])
  status?: TxStatus;
}

export class FeeRateQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  blockTarget?: number;
}

function normalizeLabels(input: unknown): string[] {
  if (Array.isArray(input)) {
    return sanitizeLabels(input);
  }

  if (typeof input === 'string') {
    if (input.includes(',')) {
      return sanitizeLabels(input.split(','));
    }
    return sanitizeLabels([input]);
  }

  return [];
}

function sanitizeLabels(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of values) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = trimmed.slice(0, 120);
    if (seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    result.push(normalized);
    if (result.length >= 10) {
      break;
    }
  }

  return result;
}
