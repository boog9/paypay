import type { ReactNode } from "react";
import { Suspense } from "react";

import { AuthGate } from "../../components/auth/auth-gate";
import { AppShell } from "../../components/shell/app-shell";
import { DashboardGate } from "./dashboard-gate";

function AuthGateSuspenseFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Checking session…</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AuthGateSuspenseFallback />}>
      <AuthGate>
        <AppShell>
          <DashboardGate>{children}</DashboardGate>
        </AppShell>
      </AuthGate>
    </Suspense>
  );
}
