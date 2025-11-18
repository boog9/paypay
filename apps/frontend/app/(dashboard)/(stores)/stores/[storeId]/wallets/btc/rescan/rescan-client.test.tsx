import { fireEvent, render, waitFor, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RescanClient } from "./rescan-client";

const pushMock = vi.fn<(path: string) => void>();
const toastMock = vi.fn<(payload: { title: string; description: string }) => void>();
const rescanMock = vi.fn<(storeId: string, payload: { startIndex: number; gapLimit: number; batchSize: number }) => Promise<void>>();
const rescanBtcWalletMock = (storeId: string, payload: { startIndex: number; gapLimit: number; batchSize: number }): Promise<void> => rescanMock(storeId, payload);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/lib/api/btc-wallet-actions", () => ({
  rescanBtcWallet: rescanBtcWalletMock,
}));

describe("RescanClient", () => {
  afterEach(() => {
    pushMock.mockReset();
    toastMock.mockReset();
    rescanMock.mockReset();
  });

  it("submits rescan parameters, shows toast, and redirects to settings", async () => {
    rescanMock.mockResolvedValue(undefined);

    render(<RescanClient storeId="store-abc" />);

    fireEvent.change(screen.getByLabelText(/Starting index/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/Gap limit/i), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText(/Batch size/i), { target: { value: "100" } });

    fireEvent.click(screen.getByRole("button", { name: /start scan/i }));

    await waitFor(() => {
      expect(rescanMock).toHaveBeenCalledWith("store-abc", { startIndex: 5, gapLimit: 2000, batchSize: 100 });
      expect(toastMock).toHaveBeenCalledWith({
        title: "Rescan started",
        description: "BTCPay is rescanning your on-chain wallet. This may take a while.",
      });
      expect(pushMock).toHaveBeenCalledWith("/stores/store-abc/wallets/btc/settings");
    });
  });
});
