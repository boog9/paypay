import type { ReactNode } from "react";
import { Suspense } from "react";

import { AuthGate } from "../../components/auth/auth-gate";
import { AppShell } from "../../components/shell/app-shell";
import { DashboardGate } from "./dashboard-gate";
import { WalletPresenceProvider } from "../../src/contexts/wallet-presence";
import { getWalletPresence } from "./stores/[storeId]/_lib/get-wallet-presence";

type DashboardLayoutProps = {
  children: ReactNode;
  params: Promise<{ storeId?: string }>;
};

function AuthGateSuspenseFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Checking session…</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
    </div>
  );
}

export default async function AppLayout({ children, params }: DashboardLayoutProps) {
  const resolvedParams = await params;
  let connected: boolean | null = null;

  if (typeof resolvedParams?.storeId === "string" && resolvedParams.storeId.length > 0) {
    const fetchWalletPresence = getWalletPresence as (storeId: string) => Promise<boolean>;
    connected = Boolean(await fetchWalletPresence(resolvedParams.storeId));
  }

  return (
    <Suspense fallback={<AuthGateSuspenseFallback />}>
      <AuthGate>
        <WalletPresenceProvider initial={connected}>
          <AppShell>
            <DashboardGate>{children}</DashboardGate>
          </AppShell>
        </WalletPresenceProvider>
      </AuthGate>
    </Suspense>
  );
}
