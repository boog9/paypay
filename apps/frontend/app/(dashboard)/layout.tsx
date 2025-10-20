import type { ReactNode } from "react";

import { AuthGate } from "../../components/auth/auth-gate";
import { AppShell } from "../../components/shell/app-shell";
import { DashboardGate } from "./dashboard-gate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>
        <DashboardGate>{children}</DashboardGate>
      </AppShell>
    </AuthGate>
  );
}
