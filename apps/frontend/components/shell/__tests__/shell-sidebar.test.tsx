import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShellSidebar } from "../sidebar";
import { StoreProvider } from "../../../src/contexts/store-context";

const { usePathnameMock, useWalletPresenceMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/"),
  useWalletPresenceMock: vi.fn(() => ({
    hasWallet: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock("../../../src/components/stores/store-selector", () => ({
  StoreSelector: ({ onStoreSelected }: { onStoreSelected?: () => void }) => (
    <button type="button" onClick={onStoreSelected}>
      Select store
    </button>
  ),
}));

vi.mock("../../../src/contexts/wallet-presence", () => ({
  useWalletPresence: () => useWalletPresenceMock(),
}));

function renderSidebar({ walletConnected, pathname }: { walletConnected: boolean | null; pathname: string }) {
  usePathnameMock.mockReturnValue(pathname);
  useWalletPresenceMock.mockReturnValue({
    hasWallet: walletConnected,
    loading: false,
    error: null,
    refresh: vi.fn(),
  });

  return render(
    <StoreProvider storeId="store-123">
      <ShellSidebar variant="desktop" user={{ name: "Ada Merchant", email: "ada@example.com" }} />
    </StoreProvider>
  );
}

describe("ShellSidebar wallets navigation", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/");
    useWalletPresenceMock.mockReset();
  });

  it("links Bitcoin entry to the wizard when wallet is not connected", () => {
    renderSidebar({ walletConnected: false, pathname: "/stores/store-123/dashboard" });

    const bitcoinLink = screen.getByRole("link", { name: "Bitcoin" });
    expect(bitcoinLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/wizard");
    const walletGroup = bitcoinLink.parentElement as HTMLElement;
    expect(within(walletGroup).queryByRole("link", { name: "Transactions" })).not.toBeInTheDocument();
    expect(within(walletGroup).queryByRole("link", { name: "Send" })).not.toBeInTheDocument();
    expect(within(walletGroup).queryByRole("link", { name: "Receive" })).not.toBeInTheDocument();
    expect(within(walletGroup).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("renders full Bitcoin submenu and highlights the active route when connected", () => {
    renderSidebar({ walletConnected: true, pathname: "/stores/store-123/wallets/btc/send" });

    const bitcoinLink = screen.getByRole("link", { name: "Bitcoin" });
    expect(bitcoinLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/transactions");
    expect(bitcoinLink).toHaveClass("bg-muted");
    expect(bitcoinLink).toHaveClass("text-foreground");

    const walletGroup = bitcoinLink.parentElement as HTMLElement;
    const transactionsLink = within(walletGroup).getByRole("link", { name: "Transactions" });
    const sendLink = within(walletGroup).getByRole("link", { name: "Send" });
    const receiveLink = within(walletGroup).getByRole("link", { name: "Receive" });
    const settingsLink = within(walletGroup).getByRole("link", { name: "Settings" });

    expect(transactionsLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/transactions");
    expect(sendLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/send");
    expect(receiveLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/receive");
    expect(settingsLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/settings");

    expect(sendLink).toHaveClass("bg-muted");
    expect(sendLink).toHaveClass("text-foreground");
  });
});
