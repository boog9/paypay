"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MoreHorizontal, Pin, PinOff } from "lucide-react";

import { cn } from "../lib/utils";
import type { StoreOption } from "./store-selector";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type StoresNavListProps = {
  stores: StoreOption[];
  activeStoreId?: string;
  onNavigate?: () => void;
};

export function StoresNavList({ stores, activeStoreId, onNavigate }: StoresNavListProps) {
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(stores.slice(0, 2).map((store) => store.id)));

  const { pinnedStores, recentStores } = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = (store: StoreOption) =>
      !normalizedQuery || store.name.toLowerCase().includes(normalizedQuery);

    const pinnedStoresList = stores.filter((store) => pinned.has(store.id) && matchesQuery(store));
    const recentStoresList = stores.filter((store) => !pinned.has(store.id) && matchesQuery(store)).slice(0, 8);

    return { pinnedStores: pinnedStoresList, recentStores: recentStoresList };
  }, [pinned, query, stores]);

  const togglePinned = (storeId: string) => {
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        next.add(storeId);
      }
      return next;
    });
  };

  if (!stores.length) {
    return (
      <div className="flex flex-1 flex-col justify-between gap-6 px-4 py-6">
        <div className="rounded-xl border border-dashed bg-muted/30 p-5 text-sm text-muted-foreground">
          You do not have any stores yet. Create your first BTCPay store to unlock dashboards and API credentials.
        </div>
        <Button asChild className="w-full justify-center">
          <Link href="/stores/new" onClick={onNavigate}>
            Create store
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-5">
      <div className="space-y-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stores"
          aria-label="Search stores"
        />
        <nav aria-label="Your stores" className="space-y-3">
          {pinnedStores.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned</p>
              <ul className="space-y-1" role="list">
                {pinnedStores.map((store) => (
                  <StoreNavItem
                    key={store.id}
                    store={store}
                    isActive={store.id === activeStoreId}
                    onNavigate={onNavigate}
                    onTogglePin={togglePinned}
                    isPinned
                  />
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1">
            {pinnedStores.length > 0 && (
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
            )}
            <ul className="space-y-1" role="list">
              {recentStores.map((store) => (
                <StoreNavItem
                  key={store.id}
                  store={store}
                  isActive={store.id === activeStoreId}
                  onNavigate={onNavigate}
                  onTogglePin={togglePinned}
                />
              ))}
              {recentStores.length === 0 && pinnedStores.length === 0 && (
                <li className="px-2 text-sm text-muted-foreground">No stores found.</li>
              )}
            </ul>
          </div>
        </nav>
      </div>
      <Button asChild variant="outline" className="justify-center">
        <Link href="/stores/new" onClick={onNavigate}>
          Create store
        </Link>
      </Button>
    </div>
  );
}

type StoreNavItemProps = {
  store: StoreOption;
  isActive: boolean;
  onNavigate?: () => void;
  onTogglePin: (storeId: string) => void;
  isPinned?: boolean;
};

function StoreNavItem({ store, isActive, onNavigate, onTogglePin, isPinned = false }: StoreNavItemProps) {
  const statusIndicator = getStatusIndicator(store.status);

  return (
    <li>
      <Link
        href={`/tenants/${store.id}`}
        onClick={onNavigate}
        className={cn(
          "group flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="text-lg">
            {store.emoji ?? "🏬"}
          </span>
          <span className="flex flex-col text-left">
            <span className="font-medium">{store.name}</span>
            <span className="text-xs text-muted-foreground">{statusIndicator.label}</span>
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              statusIndicator.color
            )}
            aria-hidden="true"
            title={statusIndicator.tooltip}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={isPinned ? `Unpin ${store.name}` : `Pin ${store.name}`}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={4}
                className="z-50 min-w-[140px] rounded-md border bg-popover p-1 text-sm shadow-md"
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:bg-muted/70"
                  onSelect={(event) => {
                    event.preventDefault();
                    onTogglePin(store.id);
                  }}
                >
                  {isPinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
                  {isPinned ? "Unpin" : "Pin"}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </span>
      </Link>
    </li>
  );
}

function getStatusIndicator(status: StoreOption["status"]) {
  switch (status) {
    case "connected":
      return { color: "bg-emerald-500", label: "Connected", tooltip: "Store connected" };
    case "pending":
      return { color: "bg-amber-400", label: "Pending", tooltip: "Awaiting configuration" };
    case "error":
      return { color: "bg-red-500", label: "Action required", tooltip: "Connection issue" };
    default:
      return { color: "bg-muted", label: "Unknown", tooltip: "Status unknown" };
  }
}
