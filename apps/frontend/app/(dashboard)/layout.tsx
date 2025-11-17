import type { ReactNode } from "react";
import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AuthGate } from "../../components/auth/auth-gate";
import { AppShell } from "../../components/shell/app-shell";
import { getCurrentUserSafe } from "../../src/auth/server";
import { DashboardGate } from "./dashboard-gate";
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
  const user = await getCurrentUserSafe();

  if (!user) {
    redirect("/sign-in?reason=session-expired");
  }

  let walletHasWallet: boolean | null = null;

  if (typeof resolvedParams?.storeId === "string" && resolvedParams.storeId.length > 0) {
    const presence = await getWalletPresence(resolvedParams.storeId);

    if (presence.status === 401) {
      redirect("/sign-in?reason=session-expired");
    }

    walletHasWallet = presence.hasWallet;
  }

  return (
    <Suspense fallback={<AuthGateSuspenseFallback />}>
      <AuthGate>
        <AppShell user={{ name: user.name ?? null, email: user.email }} walletHasWallet={walletHasWallet}>
          <DashboardGate>{children}</DashboardGate>
        </AppShell>
      </AuthGate>
    </Suspense>
  );
}
