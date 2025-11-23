import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWalletSettingsViewModel } from "./_lib/get-wallet-settings";
import SettingsPage from "./page";

const { getWalletSettingsMock, getWalletActionsMock, redirectMock, pushMock } = vi.hoisted(() => ({
  getWalletSettingsMock: vi.fn(),
  getWalletActionsMock: vi.fn(),
  redirectMock: vi.fn<(path: string) => void>(),
  pushMock: vi.fn(),
}));

vi.mock("./_lib/get-wallet-settings", () => ({
  getWalletSettings: getWalletSettingsMock,
}));

vi.mock("./_lib/get-wallet-actions", () => ({
  getWalletActions: getWalletActionsMock,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("Bitcoin wallet settings page", () => {
  afterEach(() => {
    getWalletSettingsMock.mockReset();
    getWalletActionsMock.mockReset();
    redirectMock.mockReset();
  });

  it("renders settings and wallet actions when a wallet is connected", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 200,
      data: { hasOnChainPaymentMethod: true, enabled: true } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });
    getWalletActionsMock.mockResolvedValue({
      status: 200,
      data: ["prune-history", "remove"],
      error: null,
      attemptedRefresh: false,
    });

    const view = await SettingsPage({
      params: Promise.resolve({ storeId: "store-123" }),
      searchParams: Promise.resolve({}),
    });

    render(view);

    expect(screen.getByRole("button", { name: /actions/i })).toBeInTheDocument();
  });

  it("shows empty state when the on-chain wallet is disabled", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 200,
      data: { hasOnChainPaymentMethod: true, enabled: false } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });
    getWalletActionsMock.mockResolvedValue({ status: 200, data: [], error: null, attemptedRefresh: false });

    const view = await SettingsPage({
      params: Promise.resolve({ storeId: "store-789" }),
      searchParams: Promise.resolve({}),
    });

    render(view);

    expect(screen.getByText(/no available actions/i)).toBeInTheDocument();
  });

  it("shows empty state when no on-chain wallet is configured", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 404,
      data: { hasOnChainPaymentMethod: false } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });
    getWalletActionsMock.mockResolvedValue({ status: 200, data: [], error: null, attemptedRefresh: false });

    const view = await SettingsPage({
      params: Promise.resolve({ storeId: "store-456" }),
      searchParams: Promise.resolve({}),
    });

    render(view);

    expect(screen.getByText(/no available actions/i)).toBeInTheDocument();
  });
});
