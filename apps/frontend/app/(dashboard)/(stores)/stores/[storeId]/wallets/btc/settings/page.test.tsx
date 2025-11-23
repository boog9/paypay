import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWalletSettingsViewModel } from "./_lib/get-wallet-settings";
import SettingsPage from "./page";

const { getWalletSettingsMock, redirectMock } = vi.hoisted(() => ({
  getWalletSettingsMock: vi.fn(),
  redirectMock: vi.fn<(path: string) => void>(),
}));

vi.mock("./_lib/get-wallet-settings", () => ({
  getWalletSettings: getWalletSettingsMock,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

describe("Bitcoin wallet settings page", () => {
  afterEach(() => {
    getWalletSettingsMock.mockReset();
    redirectMock.mockReset();
  });

  it("renders settings without wallet actions when a wallet is connected", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 200,
      data: { hasOnChainPaymentMethod: true, enabled: true } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });

    const view = await SettingsPage({
      params: Promise.resolve({ storeId: "store-123" }),
      searchParams: Promise.resolve({}),
    });

    render(view);

    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
  });

  it("hides actions when the on-chain wallet is disabled", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 200,
      data: { hasOnChainPaymentMethod: true, enabled: false } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });

    const view = await SettingsPage({
      params: Promise.resolve({ storeId: "store-789" }),
      searchParams: Promise.resolve({}),
    });

    render(view);

    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
  });

  it("hides actions when no on-chain wallet is configured", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 404,
      data: { hasOnChainPaymentMethod: false } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });

    const view = await SettingsPage({
      params: Promise.resolve({ storeId: "store-456" }),
      searchParams: Promise.resolve({}),
    });
  
    render(view);

    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
  });
});
