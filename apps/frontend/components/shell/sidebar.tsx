"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { useStoreContext } from "../../src/contexts/store-context";
import { RateLimitError, useWalletPresence } from "../../src/contexts/wallet-presence";
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
  const { hasWallet, error: walletError } = useWalletPresence();

  const primaryNav = [
    { label: "Dashboard", href: baseStorePath ? `${baseStorePath}/dashboard` : null },
    { label: "Settings", href: baseStorePath ? `${baseStorePath}/settings` : null },
  ];

  const walletHasMenu = hasWallet === true;
  const walletBaseHref = baseStorePath ? `${baseStorePath}/wallets/btc` : null;
  const walletHref = (() => {
    if (!baseStorePath) {
      return null;
    }
    if (hasWallet === false) {
      return `${baseStorePath}/wallets/btc/wizard`;
    }
    if (hasWallet === true) {
      return `${baseStorePath}/wallets/btc/transactions`;
    }
    return walletBaseHref;
  })();

  const walletNav: {
    label: string;
    href: string | null;
    baseHref: string | null;
    children: { label: string; href: string | null }[];
  }[] = [
    {
      label: "Bitcoin",
      href: walletHref,
      baseHref: walletBaseHref,
      children: walletHasMenu
        ? [
            { label: "Transactions", href: baseStorePath ? `${baseStorePath}/wallets/btc/transactions` : null },
            { label: "Send", href: baseStorePath ? `${baseStorePath}/wallets/btc/send` : null },
            { label: "Receive", href: baseStorePath ? `${baseStorePath}/wallets/btc/receive` : null },
            { label: "Settings", href: baseStorePath ? `${baseStorePath}/wallets/btc/settings` : null },
          ]
        : [],
    },
  ];

  const walletRateLimited = walletError instanceof RateLimitError;

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
          <div className="flex flex-col gap-2">
            {walletNav.map((item) => {
              const parentIsActive = Boolean(
                (item.baseHref ?? item.href) && pathname.startsWith(item.baseHref ?? item.href ?? "")
              );

              return (
                <div key={item.label} className="flex flex-col gap-1">
                  <NavItem href={item.href} isActive={parentIsActive} onNavigate={onNavigate}>
                    {item.label}
                  </NavItem>
                  {item.children.length > 0 ? (
                    <div className="ml-3 flex flex-col gap-1 border-l border-border/40 pl-3">
                      {item.children.map((child) => (
                        <NavItem
                          key={child.label}
                          href={child.href}
                          isActive={Boolean(child.href && pathname.startsWith(child.href))}
                          onNavigate={onNavigate}
                          className="text-xs"
                        >
                          {child.label}
                        </NavItem>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {walletRateLimited ? (
            <p className="px-2 text-xs text-amber-600 dark:text-amber-400">
              Too many requests, please try again in a few seconds.
            </p>
          ) : null}
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
  className?: string;
};

function NavItem({ href, isActive, onNavigate, children, className }: NavItemProps) {
  const composedClassName = cn(
    "flex items-center rounded-md px-2 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive ? "bg-muted text-foreground" : "text-muted-foreground",
    !href && "cursor-not-allowed opacity-50 hover:bg-transparent",
    className,
  );

  if (!href) {
    return (
      <span className={composedClassName} aria-disabled>
        {children}
      </span>
    );
  }

  const shouldDisablePrefetch = href.includes("/wallets/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={composedClassName}
      prefetch={shouldDisablePrefetch ? false : undefined}
    >
      {children}
    </Link>
  );
}
