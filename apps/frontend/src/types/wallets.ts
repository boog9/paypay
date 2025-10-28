export type TxDirection = 'in' | 'out';
export type TxStatus = 'confirmed' | 'unconfirmed' | 'replaced' | 'double-spent';

export interface WalletTransaction {
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

export interface WalletTransactionsResponse {
  total?: number;
  items: WalletTransaction[];
}

export interface WalletOverview {
  balance: string;
  confirmedBalance: string;
  unconfirmedBalance: string;
  label?: string | null;
}
