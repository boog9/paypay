import Link from "next/link";

import { cn } from "../../lib/utils";
import { SidebarNav } from "./sidebar-nav";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Stores", href: "/stores" },
] as const;

type ShellSidebarProps = {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
};

export function ShellSidebar({ variant, onNavigate }: ShellSidebarProps) {
  return (
    <aside
      aria-label="Application navigation"
      className={cn(
        "flex w-full max-w-[240px] flex-col border-b bg-background/95 text-sm shadow-sm backdrop-blur",
        variant === "desktop" && "hidden lg:flex lg:min-h-screen lg:border-b-0 lg:border-r",
        variant === "mobile" && "lg:hidden"
      )}
    >
      <div className="flex h-16 items-center border-b px-6 text-base font-semibold text-foreground lg:h-20 lg:px-8">
        <Link
          href="/dashboard"
          className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          PayPay Portal
        </Link>
      </div>
      <SidebarNav items={NAV_ITEMS} onNavigate={onNavigate} />
    </aside>
  );
}
