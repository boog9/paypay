import { fireEvent, render, screen } from "@testing-library/react";
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

// Radix dropdowns rely on PointerEvent; JSDOM omits it by default.
if (!global.PointerEvent) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  global.PointerEvent = MouseEvent;
}

describe("Bitcoin wallet settings page", () => {
  afterEach(() => {
    getWalletSettingsMock.mockReset();
    redirectMock.mockReset();
  });

  it("renders actions and rescan link when a wallet is connected", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 200,
      data: { hasOnChainPaymentMethod: true, enabled: true } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });

    const view = await SettingsPage({
      params: { storeId: "store-123" },
      searchParams: {},
    });

    render(view);

    const button = screen.getByRole("button", { name: /actions/i });
    expect(button).toBeVisible();

    fireEvent.pointerDown(button);
    fireEvent.click(button);

    const rescanLink = await screen.findByRole("menuitem", { name: /Rescan wallet/i });
    expect(rescanLink).toBeVisible();
    expect(rescanLink).toHaveAttribute("href", "/stores/store-123/wallets/btc/rescan");
  });

  it("hides actions when the on-chain wallet is disabled", async () => {
    getWalletSettingsMock.mockResolvedValue({
      status: 200,
      data: { hasOnChainPaymentMethod: true, enabled: false } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh: false,
    });

    const view = await SettingsPage({
      params: { storeId: "store-789" },
      searchParams: {},
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
      params: { storeId: "store-456" },
      searchParams: {},
    });

    render(view);

    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
  });
});
