import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { WalletActions } from "./wallet-actions";

const push = vi.fn();
const toast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast })
}));

const pruneBtcWalletHistory = vi.fn();
const clearBtcWalletHistory = vi.fn();
const replaceBtcWallet = vi.fn();
const removeBtcWallet = vi.fn();

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

  it("renders actions button when enabled", () => {
    render(<WalletActions {...props} />);
    expect(screen.getByRole("button", { name: /actions/i })).toBeInTheDocument();
  });

  it("navigates to rescan page", () => {
    render(<WalletActions {...props} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: /actions/i }));
    fireEvent.click(screen.getByText(/Rescan wallet/i));

    expect(push).toHaveBeenCalledWith("/tenants/t1/stores/s1/wallets/bitcoin/rescan");
  });

  it("calls prune and clear helpers", async () => {
    pruneBtcWalletHistory.mockResolvedValue(undefined);
    clearBtcWalletHistory.mockResolvedValue(undefined);

    render(<WalletActions {...props} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /actions/i }));
    fireEvent.click(screen.getByText(/Prune old transactions/i));
    await waitFor(() => expect(pruneBtcWalletHistory).toHaveBeenCalledTimes(1));

    fireEvent.pointerDown(screen.getByRole("button", { name: /actions/i }));
    fireEvent.click(screen.getByText(/Clear all transactions/i));
    await waitFor(() => expect(clearBtcWalletHistory).toHaveBeenCalledTimes(1));
  });

  it("requires confirmation for replace and triggers API", async () => {
    replaceBtcWallet.mockResolvedValue(undefined);

    render(<WalletActions {...props} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /actions/i }));
    fireEvent.click(screen.getByText(/Replace wallet/i));

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
    fireEvent.pointerDown(screen.getByRole("button", { name: /actions/i }));
    fireEvent.click(screen.getByText(/Remove wallet/i));

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
