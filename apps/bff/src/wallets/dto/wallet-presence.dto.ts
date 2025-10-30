import type { OnchainWalletPresence } from '../onchain-wallets.service';

export interface WalletPresenceDto {
  enabled: boolean;
  config: {
    derivationScheme: string | null;
  };
}

export function toWalletPresenceDto(presence: OnchainWalletPresence): WalletPresenceDto {
  return {
    enabled: presence.enabled,
    config: { derivationScheme: presence.derivationScheme }
  } satisfies WalletPresenceDto;
}
