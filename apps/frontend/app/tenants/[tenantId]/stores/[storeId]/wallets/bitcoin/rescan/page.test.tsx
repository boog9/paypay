import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import RescanPage from "./page";

const { push, toast, rescanBtcWallet } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  rescanBtcWallet: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast })
}));

vi.mock("@/lib/api/btc-wallet-actions", () => ({
  rescanBtcWallet: (...args: unknown[]) => rescanBtcWallet(...args)
}));

describe("RescanPage", () => {
  const params = Promise.resolve({ tenantId: "tenant-1", storeId: "store-1" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = async (): Promise<void> => {
    await act(async () => {
      const element = await RescanPage({ params });
      render(element);
    });
  };

  it("shows default values", async () => {
    await renderPage();
    expect(screen.getByLabelText(/Starting index/i)).toHaveValue(0);
    expect(screen.getByLabelText(/Gap limit/i)).toHaveValue(10000);
    expect(screen.getByLabelText(/Batch size/i)).toHaveValue(3000);
  });

  it("prevents negative inputs", async () => {
    await renderPage();

    const startInput = screen.getByLabelText(/Starting index/i);
    fireEvent.change(startInput, { target: { value: "-5" } });
    expect(startInput).toHaveValue(0);

    const batchInput = screen.getByLabelText(/Batch size/i);
    fireEvent.change(batchInput, { target: { value: "0" } });
    expect(batchInput).toHaveValue(3000);
  });

  it("submits values and redirects", async () => {
    rescanBtcWallet.mockResolvedValue(undefined);

    await renderPage();

    fireEvent.change(screen.getByLabelText(/Starting index/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/Gap limit/i), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/Batch size/i), { target: { value: "50" } });

    fireEvent.click(screen.getByRole("button", { name: /start scan/i }));

    await waitFor(() =>
      expect(rescanBtcWallet).toHaveBeenCalledWith("store-1", {
        startIndex: 5,
        gapLimit: 25,
        batchSize: 50
      })
    );
    expect(push).toHaveBeenCalledWith(
      "/tenants/tenant-1/stores/store-1/wallets/bitcoin/settings"
    );
  });
});
