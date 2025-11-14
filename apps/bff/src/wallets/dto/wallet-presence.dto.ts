export interface WalletPresenceDto {
  hasWallet: boolean;
}

export function toWalletPresenceDto(hasWallet: boolean): WalletPresenceDto {
  return { hasWallet } satisfies WalletPresenceDto;
}
