import Link from "next/link";
import { SidebarNav } from "./sidebar-nav";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Stores", href: "/tenants" }
] as const;

export function ShellSidebar() {
  return (
    <aside
      className="flex flex-col border-b bg-card/70 lg:min-h-screen lg:border-b-0 lg:border-r"
      aria-label="Sidebar"
    >
      <div className="flex h-16 items-center border-b px-6 text-base font-semibold text-foreground lg:border-b-0">
        <Link href="/dashboard" className="transition hover:text-primary">
          PayPay Portal
        </Link>
      </div>
      <SidebarNav items={NAV_ITEMS} />
    </aside>
  );
}
