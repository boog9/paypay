import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import type { WalletActionId } from "../_lib/get-wallet-actions";
import { WalletActionsMenu } from "./wallet-actions-menu";

const { push, toast, pruneBtcWalletHistory, clearBtcWalletHistory, replaceBtcWallet, removeBtcWallet } = vi.hoisted(() => {
  const pushMock = vi.fn<(path: string) => void>();
  const toastMock = vi.fn<
    (options: {
      title: string;
      description?: string;
      variant?: string;
    }) => void
  >();
  const pruneBtcWalletHistoryMock = vi.fn<(storeId: string) => Promise<void>>();
  const clearBtcWalletHistoryMock = vi.fn<(storeId: string) => Promise<void>>();
  const replaceBtcWalletMock = vi.fn<(storeId: string) => Promise<void>>();
  const removeBtcWalletMock = vi.fn<(storeId: string) => Promise<void>>();

  return {
    push: pushMock,
    toast: toastMock,
    pruneBtcWalletHistory: pruneBtcWalletHistoryMock,
    clearBtcWalletHistory: clearBtcWalletHistoryMock,
    replaceBtcWallet: replaceBtcWalletMock,
    removeBtcWallet: removeBtcWalletMock,
  };
});

vi.mock("@radix-ui/react-dropdown-menu", () => {
  type DropdownItemProps = React.ComponentProps<"button"> & { onSelect?: (event: Event) => void };
  const dropdownMenu = {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: ({ children, asChild, ...props }: React.ComponentProps<"button"> & { asChild?: boolean }) =>
      asChild && React.isValidElement(children) ? (
        React.cloneElement(children, props)
      ) : (
        <button type="button" {...props}>
          {children}
        </button>
      ),
    Content: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Item: ({ children, onSelect, onClick, ...props }: DropdownItemProps) => (
      <button
        role="menuitem"
        type="button"
        {...props}
        onClick={(event) => {
          onSelect?.(event);
          onClick?.(event);
        }}
      >
        {children}
      </button>
    ),
  };

  return dropdownMenu as unknown as typeof import("@radix-ui/react-dropdown-menu");
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/lib/api/btc-wallet-actions", () => ({
  pruneBtcWalletHistory,
  clearBtcWalletHistory,
  replaceBtcWallet,
  removeBtcWallet,
}));

describe("WalletActionsMenu", () => {
  const props = {
    storeId: "store-123",
    actions: ["prune-history", "clear-history", "replace", "remove"] as WalletActionId[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openMenu = (): void => {
    const trigger = screen.getByRole("button", { name: /actions/i });
    act(() => {
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);
    });
  };

  it("renders actions button and triggers prune/clear helpers", async () => {
    pruneBtcWalletHistory.mockResolvedValue(undefined);
    clearBtcWalletHistory.mockResolvedValue(undefined);

    render(<WalletActionsMenu {...props} />);
    openMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: /Prune old transactions/i }));
    await waitFor(() => expect(pruneBtcWalletHistory).toHaveBeenCalledWith("store-123"));

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Clear all transactions/i }));
    await waitFor(() => expect(clearBtcWalletHistory).toHaveBeenCalledWith("store-123"));
  });

  it("requires confirmation for replace and remove", async () => {
    replaceBtcWallet.mockResolvedValue(undefined);
    removeBtcWallet.mockResolvedValue(undefined);

    render(<WalletActionsMenu {...props} />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Replace wallet/i }));

    const replaceButton = screen.getByRole("button", { name: /Replace wallet/i });
    expect(replaceButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/REPLACE/), { target: { value: "REPLACE" } });
    expect(replaceButton).not.toBeDisabled();
    fireEvent.click(replaceButton);
    await waitFor(() => expect(replaceBtcWallet).toHaveBeenCalledWith("store-123"));

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove wallet/i }));
    const removeButton = screen.getByRole("button", { name: /Remove wallet/i });
    fireEvent.change(screen.getByPlaceholderText(/REMOVE/), { target: { value: "REMOVE" } });
    fireEvent.click(removeButton);

    await waitFor(() => expect(removeBtcWallet).toHaveBeenCalledWith("store-123"));
    expect(push).toHaveBeenCalledWith("/stores/store-123/wallets/btc");
  });

  it("shows empty state when no actions are available", () => {
    render(<WalletActionsMenu storeId="store-abc" actions={[]} />);

    expect(screen.getByText(/no available actions/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
  });

  it("renders an error message when provided", () => {
    render(<WalletActionsMenu storeId="store-abc" actions={null} error="Unable to load actions" />);

    expect(screen.getByText(/unable to load actions/i)).toBeVisible();
  });

  it("does not render any rescan option", () => {
    render(<WalletActionsMenu {...props} />);
    expect(screen.queryByText(/rescan/i)).not.toBeInTheDocument();
  });
});
