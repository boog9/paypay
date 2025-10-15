import type { ReactNode } from "react";
import { ShellHeader } from "./header";
import { ShellSidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full bg-muted/20 lg:grid-cols-[240px_1fr]">
      <ShellSidebar />
      <div className="flex flex-col">
        <ShellHeader />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
