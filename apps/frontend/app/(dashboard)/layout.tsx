import type { ReactNode } from "react";
import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";

import { AuthGate } from "../../components/auth/auth-gate";
import { AppShell } from "../../components/shell/app-shell";
import { DashboardGate } from "./dashboard-gate";
import { WalletPresenceProvider } from "../../src/contexts/wallet-presence";
import { getWalletPresence } from "./(stores)/stores/[storeId]/_lib/get-wallet-presence";

export const dynamic = "force-dynamic";

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
  noStore();
  const resolvedParams = await params;
  let hasWallet: boolean | null = null;

  if (typeof resolvedParams?.storeId === "string" && resolvedParams.storeId.length > 0) {
    const presence = await getWalletPresence(resolvedParams.storeId);
    hasWallet = presence.hasWallet;
  }

  return (
    <Suspense fallback={<AuthGateSuspenseFallback />}>
      <AuthGate>
        <WalletPresenceProvider storeId={resolvedParams?.storeId ?? null} initial={hasWallet}>
          <AppShell>
            <DashboardGate>{children}</DashboardGate>
          </AppShell>
        </WalletPresenceProvider>
      </AuthGate>
    </Suspense>
  );
}
