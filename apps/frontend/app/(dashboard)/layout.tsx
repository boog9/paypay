import type { ReactNode } from "react";
import { AppShell } from "../../components/shell/app-shell";
import { DashboardGate } from "./dashboard-gate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <DashboardGate>{children}</DashboardGate>
    </AppShell>
  );
}
