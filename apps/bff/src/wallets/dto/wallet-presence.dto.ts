import type { WalletPresenceState } from '../onchain-wallets.service';

export interface WalletPresenceDto {
  enabled: boolean;
  config: {
    derivationScheme: string | null;
  };
}

export function toWalletPresenceDto(presence: WalletPresenceState): WalletPresenceDto {
  return {
    enabled: presence.enabled,
    config: { derivationScheme: presence.derivationScheme }
  } satisfies WalletPresenceDto;
}
