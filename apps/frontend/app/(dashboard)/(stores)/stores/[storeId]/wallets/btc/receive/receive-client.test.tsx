import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ToastProvider } from "../../../../../../../../components/ui/toast";
import { ReceiveClient } from "./receive-client";
import type { useBtcReceiveAddress, useBtcReservedAddresses } from "@/lib/hooks/use-btc-receive";

const mockUseReceive = vi.fn<ReturnType<typeof useBtcReceiveAddress>, Parameters<typeof useBtcReceiveAddress>>();
const mockUseReserved = vi.fn<
  ReturnType<typeof useBtcReservedAddresses>,
  Parameters<typeof useBtcReservedAddresses>
>();
const mockedUseBtcReceiveAddress: typeof useBtcReceiveAddress = (...args) =>
  mockUseReceive(...args) as ReturnType<typeof useBtcReceiveAddress>;
const mockedUseBtcReservedAddresses: typeof useBtcReservedAddresses = (...args) =>
  mockUseReserved(...args) as ReturnType<typeof useBtcReservedAddresses>;
const mockGenerate = vi.fn();
const mockToast = { toast: vi.fn() };

vi.mock("@/lib/hooks/use-btc-receive", () => ({
  useBtcReceiveAddress: mockedUseBtcReceiveAddress,
  useBtcReservedAddresses: mockedUseBtcReservedAddresses,
}));

vi.mock("../../../../../../../../components/ui/toast", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="toast-provider">{children}</div>,
  useToast: () => mockToast,
}));

vi.mock("react-qr-code", () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="qr-code" data-value={value} />,
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ReceiveClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseReceive.mockReturnValue({
      data: {
        address: "tb1qexampleaddress0000000001",
        paymentLink: "bitcoin:tb1qexampleaddress0000000001",
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
      generate: mockGenerate,
      isGenerating: false,
    });

    mockUseReserved.mockReturnValue({
      data: { items: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });
  });

  it("renders receive header and QR placeholder", () => {
    renderWithProviders(<ReceiveClient storeId="store-123" hasWallet={true} />);

    expect(screen.getByText(/Receive BTC/i)).toBeInTheDocument();
    expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    expect(screen.getByText("tb1qexampleaddress0000000001")).toBeInTheDocument();
  });

  it("switches to payment link view", () => {
    renderWithProviders(<ReceiveClient storeId="store-123" hasWallet={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Link/i }));

    expect(screen.getByText(/PAYMENT LINK/i)).toBeInTheDocument();
    expect(screen.getByText("bitcoin:tb1qexampleaddress0000000001")).toBeInTheDocument();
  });

  it("calls generate when clicking the button", () => {
    renderWithProviders(<ReceiveClient storeId="store-123" hasWallet={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Generate another address/i }));

    expect(mockGenerate).toHaveBeenCalled();
  });
});
