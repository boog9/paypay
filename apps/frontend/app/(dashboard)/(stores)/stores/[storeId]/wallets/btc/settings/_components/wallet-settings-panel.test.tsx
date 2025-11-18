import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalletSettingsPanel } from "./wallet-settings-panel";

describe("WalletSettingsPanel", () => {
  it("renders descriptor fields when a wallet is connected", () => {
    render(
      <WalletSettingsPanel
        viewModel={{
          hasOnChainPaymentMethod: true,
          enabled: true,
          accountKeyPath: "m/84'/1'/0'",
          masterFingerprint: "DEADBEEF",
          label: "Primary wallet",
        }}
        showBanner={false}
        errorMessage={null}
        showSuccessAlert={false}
      />,
    );

    expect(screen.getByText("On-chain BTC payment method")).toBeVisible();
    expect(screen.getByText("m/84'/1'/0'" )).toBeVisible();
    expect(screen.getByText("DEADBEEF")).toBeVisible();
    expect(screen.getByText("Primary wallet")).toBeVisible();
    expect(screen.queryByText(/not enabled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tpub/i)).not.toBeInTheDocument();
  });

  it("shows banner and empty state when no on-chain payment method exists", () => {
    render(
      <WalletSettingsPanel
        viewModel={{ hasOnChainPaymentMethod: false }}
        showBanner={true}
        errorMessage={null}
        showSuccessAlert={false}
      />,
    );

    expect(
      screen.getByText("On-chain BTC payment method is not enabled. Run the wallet wizard to connect a wallet."),
    ).toBeVisible();
    expect(screen.getByText(/No on-chain BTC wallet is connected to this store./)).toBeVisible();
  });

  it("shows an error message when provided", () => {
    render(
      <WalletSettingsPanel
        viewModel={{ hasOnChainPaymentMethod: true, enabled: false }}
        showBanner={false}
        errorMessage="Unable to load wallet settings."
        showSuccessAlert={false}
      />,
    );

    expect(screen.getByText("Unable to load wallet settings.")).toBeVisible();
  });

  it("shows an error message even when data is unavailable", () => {
    render(
      <WalletSettingsPanel
        viewModel={null}
        showBanner={false}
        errorMessage="Failed to reach server"
        showSuccessAlert={false}
      />,
    );

    expect(screen.getByText("Failed to reach server")).toBeVisible();
  });
});
