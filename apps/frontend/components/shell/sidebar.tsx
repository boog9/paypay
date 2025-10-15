"use client";

import { cn } from "../../lib/utils";
import type { StoreOption } from "../store-selector";
import { StoreSelector } from "../store-selector";
import { StoresNavList } from "../stores-nav-list";
import { SidebarNav } from "./sidebar-nav";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Stores", href: "/stores" },
] as const;

type ShellSidebarProps = {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
  stores: StoreOption[];
  activeStoreId?: string;
};

export function ShellSidebar({ variant, onNavigate, stores, activeStoreId }: ShellSidebarProps) {
  return (
    <aside
      aria-label="Application navigation"
      className={cn(
        "flex w-full max-w-[240px] flex-col border-b bg-background/95 text-sm shadow-sm backdrop-blur",
        variant === "desktop" && "hidden lg:flex lg:min-h-screen lg:border-b-0 lg:border-r",
        variant === "mobile" && "lg:hidden"
      )}
    >
      <div className="border-b px-4 pb-4 pt-5 lg:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stores</p>
        <div className="mt-2">
          <StoreSelector
            stores={stores}
            activeStoreId={activeStoreId}
            onStoreNavigate={onNavigate}
          />
        </div>
      </div>
      <StoresNavList stores={stores} activeStoreId={activeStoreId} onNavigate={onNavigate} />
      <SidebarNav items={NAV_ITEMS} onNavigate={onNavigate} />
    </aside>
  );
}
