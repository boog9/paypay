"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { useStoreContext } from "../../src/contexts/store-context";
import { StoreSelector } from "../../src/components/stores/store-selector";
import { Separator } from "../ui/separator";
import { UserMenu } from "../user-menu";
import { SiteLogo } from "./site-logo";

type ShellSidebarProps = {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
  user: {
    name: string;
    email: string;
  };
  onSignOut?: () => Promise<void> | void;
};

export function ShellSidebar({ variant, onNavigate, user, onSignOut }: ShellSidebarProps) {
  const { storeId } = useStoreContext();
  const pathname = usePathname();
  const baseStorePath = storeId ? `/stores/${storeId}` : null;

  const primaryNav = [
    { label: "Dashboard", href: baseStorePath ? `${baseStorePath}/dashboard` : null },
    { label: "Settings", href: baseStorePath ? `${baseStorePath}/settings` : null },
  ];

  const walletNav = [
    { label: "Bitcoin", href: baseStorePath ? `${baseStorePath}/wallets/btc` : null },
  ];

  return (
    <aside
      aria-label="Application navigation"
      className={cn(
        "flex w-full max-w-[240px] flex-col border-b bg-background/95 text-sm shadow-sm backdrop-blur",
        variant === "desktop" && "hidden lg:flex lg:min-h-screen lg:border-b-0 lg:border-r",
        variant === "mobile" && "h-full lg:hidden"
      )}
    >
      <div className="px-3 pt-3 lg:px-4">
        <SiteLogo />
      </div>
      <Separator className="my-3" />
      <div className="px-4 pb-4 lg:px-5">
        <Suspense fallback={<div className="h-10 rounded-lg bg-muted" />}>
          <StoreSelector onStoreSelected={onNavigate} />
        </Suspense>
      </div>
      <nav aria-label="Store navigation" className="flex flex-1 flex-col gap-6 px-4 lg:px-5">
        <div className="flex flex-col gap-1">
          {primaryNav.map((item) => (
            <NavItem
              key={item.label}
              href={item.href}
              isActive={Boolean(item.href && pathname.startsWith(item.href))}
              onNavigate={onNavigate}
            >
              {item.label}
            </NavItem>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wallets</span>
          <div className="flex flex-col gap-1">
            {walletNav.map((item) => (
              <NavItem
                key={item.label}
                href={item.href}
                isActive={Boolean(item.href && pathname.startsWith(item.href))}
                onNavigate={onNavigate}
              >
                {item.label}
              </NavItem>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-muted-foreground">
          <span className="px-2 text-xs font-semibold uppercase tracking-wide">Payments</span>
          <span className="px-2 text-xs">Coming soon</span>
        </div>
      </nav>
      <div className="mt-auto sticky bottom-0 border-t bg-background px-2 py-2">
        <UserMenu name={user.name} email={user.email} onSignOut={onSignOut} />
      </div>
    </aside>
  );
}

type NavItemProps = {
  href: string | null;
  isActive: boolean;
  onNavigate?: () => void;
  children: ReactNode;
};

function NavItem({ href, isActive, onNavigate, children }: NavItemProps) {
  const className = cn(
    "flex items-center rounded-md px-2 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive ? "bg-muted text-foreground" : "text-muted-foreground",
    !href && "cursor-not-allowed opacity-50 hover:bg-transparent",
  );

  if (!href) {
    return (
      <span className={className} aria-disabled>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} onClick={onNavigate} className={className}>
      {children}
    </Link>
  );
}
