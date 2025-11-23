import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { WalletActions } from "./wallet-actions";

const { push, toast, pruneBtcWalletHistory, clearBtcWalletHistory, replaceBtcWallet, removeBtcWallet } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  pruneBtcWalletHistory: vi.fn(),
  clearBtcWalletHistory: vi.fn(),
  replaceBtcWallet: vi.fn(),
  removeBtcWallet: vi.fn()
}));

vi.mock("@radix-ui/react-dropdown-menu", () => {
  const React = require("react");
  type DropdownItemProps = React.ComponentProps<"button"> & {
    onSelect?: (event: Event) => void;
  };
  return {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: ({ children, asChild, ...props }: React.ComponentProps<"button"> & { asChild?: boolean }) =>
      asChild && React.isValidElement(children) ? React.cloneElement(children, props) : (
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
          onSelect?.(event as unknown as Event);
          onClick?.(event);
        }}
      >
        {children}
      </button>
    )
  } as unknown as typeof import("@radix-ui/react-dropdown-menu");
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast })
}));

vi.mock("@/lib/api/btc-wallet-actions", () => ({
  pruneBtcWalletHistory: (...args: unknown[]) => pruneBtcWalletHistory(...args),
  clearBtcWalletHistory: (...args: unknown[]) => clearBtcWalletHistory(...args),
  replaceBtcWallet: (...args: unknown[]) => replaceBtcWallet(...args),
  removeBtcWallet: (...args: unknown[]) => removeBtcWallet(...args)
}));

describe("WalletActions", () => {
  const props = { tenantId: "t1", storeId: "s1", enabled: true };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openMenu = async (): Promise<void> => {
    const trigger = screen.getByRole("button", { name: /actions/i });
    await act(async () => {
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);
    });
  };

  it("renders actions button when enabled", () => {
    render(<WalletActions {...props} />);
    expect(screen.getByRole("button", { name: /actions/i })).toBeInTheDocument();
  });

  it("navigates to rescan page", async () => {
    render(<WalletActions {...props} />);

    await openMenu();
    const rescan = await screen.findByRole("menuitem", { name: /Rescan wallet/i });
    fireEvent.click(rescan);

    expect(push).toHaveBeenCalledWith("/tenants/t1/stores/s1/wallets/bitcoin/rescan");
  });

  it("calls prune and clear helpers", async () => {
    pruneBtcWalletHistory.mockResolvedValue(undefined);
    clearBtcWalletHistory.mockResolvedValue(undefined);

    render(<WalletActions {...props} />);
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Prune old transactions/i }));
    await waitFor(() => expect(pruneBtcWalletHistory).toHaveBeenCalledTimes(1));

    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Clear all transactions/i }));
    await waitFor(() => expect(clearBtcWalletHistory).toHaveBeenCalledTimes(1));
  });

  it("requires confirmation for replace and triggers API", async () => {
    replaceBtcWallet.mockResolvedValue(undefined);

    render(<WalletActions {...props} />);
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Replace wallet/i }));

    const confirmButton = screen.getByRole("button", { name: /Replace wallet/i });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByPlaceholderText(/REPLACE/i);
    fireEvent.change(input, { target: { value: "replace" } });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(replaceBtcWallet).toHaveBeenCalledWith("s1"));
  });

  it("requires confirmation for remove and navigates after success", async () => {
    removeBtcWallet.mockResolvedValue(undefined);

    render(<WalletActions {...props} />);
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove wallet/i }));

    const confirmButton = screen.getByRole("button", { name: /Remove wallet/i });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByPlaceholderText(/REMOVE/i);
    fireEvent.change(input, { target: { value: "remove" } });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(removeBtcWallet).toHaveBeenCalledWith("s1"));
    expect(push).toHaveBeenCalledWith("/tenants/t1/stores/s1");
  });
});
