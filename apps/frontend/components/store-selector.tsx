"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";

export type StoreOption = {
  id: string;
  name: string;
  status: "connected" | "pending" | "error";
  emoji?: string;
};

type StoreSelectorProps = {
  stores: StoreOption[];
  activeStoreId?: string;
  onStoreNavigate?: () => void;
};

export function StoreSelector({ stores, activeStoreId, onStoreNavigate }: StoreSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const activeStore = useMemo(() => {
    if (activeStoreId) {
      return stores.find((store) => store.id === activeStoreId) ?? null;
    }
    if (!pathname) {
      return stores[0] ?? null;
    }
    return stores.find((store) => pathname.startsWith(`/tenants/${store.id}`) || pathname.startsWith(`/stores/${store.id}`)) ?? stores[0] ?? null;
  }, [activeStoreId, pathname, stores]);

  const filteredStores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return stores;
    }
    return stores.filter((store) => store.name.toLowerCase().includes(normalizedQuery));
  }, [query, stores]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (!panelRef.current || !buttonRef.current) {
        return;
      }
      if (panelRef.current.contains(event.target as Node) || buttonRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus({ preventScroll: true });
      const indexToHighlight = filteredStores.findIndex((store) => store.id === activeStore?.id);
      setHighlightedIndex(indexToHighlight >= 0 ? indexToHighlight : 0);
    } else {
      setQuery("");
    }
  }, [isOpen, filteredStores, activeStore]);

  useEffect(() => {
    if (highlightedIndex >= filteredStores.length) {
      setHighlightedIndex(filteredStores.length ? filteredStores.length - 1 : 0);
    }
  }, [filteredStores.length, highlightedIndex]);

  const handleSelect = (storeId: string) => {
    setIsOpen(false);
    setQuery("");
    onStoreNavigate?.();
    router.push(`/tenants/${storeId}`);
  };

  const handleToggle = () => {
    if (!stores.length) {
      return;
    }
    setIsOpen((previous) => !previous);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          !stores.length && "cursor-not-allowed text-muted-foreground"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            }
          }
        }}
        disabled={!stores.length}
      >
        {activeStore ? (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="text-base">
              {activeStore.emoji ?? "🏬"}
            </span>
            <span className="flex flex-col text-left">
              <span className="text-sm font-semibold leading-tight">{activeStore.name}</span>
              <span className="text-xs font-medium text-muted-foreground">{statusLabel(activeStore.status)}</span>
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No stores yet</span>
        )}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute z-50 mt-2 w-full rounded-xl border bg-popover p-2 shadow-xl"
        >
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
            <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={
                filteredStores[highlightedIndex]?.id
                  ? `${listboxId}-${filteredStores[highlightedIndex]?.id}`
                  : undefined
              }
              placeholder="Search stores"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (!filteredStores.length) {
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedIndex((index) => (index + 1) % filteredStores.length);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedIndex((index) => (index - 1 + filteredStores.length) % filteredStores.length);
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const store = filteredStores[highlightedIndex];
                  if (store) {
                    handleSelect(store.id);
                  }
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsOpen(false);
                }
              }}
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-background"
          >
            {filteredStores.length ? (
              filteredStores.map((store, index) => {
                const isActive = store.id === activeStore?.id;
                const isHighlighted = index === highlightedIndex;
                return (
                  <li
                    key={store.id}
                    id={`${listboxId}-${store.id}`}
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isHighlighted ? "bg-muted/70" : "hover:bg-muted/50",
                      isActive && "font-semibold"
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(store.id);
                    }}
                  >
                    <span className="flex items-center gap-3">
                      <span aria-hidden="true" className="text-lg">
                        {store.emoji ?? "🏬"}
                      </span>
                      <span className="flex flex-col text-left">
                        <span>{store.name}</span>
                        <span className="text-xs text-muted-foreground">{statusLabel(store.status)}</span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        store.status === "connected" && "bg-emerald-500",
                        store.status === "pending" && "bg-amber-400",
                        store.status === "error" && "bg-red-500"
                      )}
                      aria-hidden="true"
                    />
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No stores found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: StoreOption["status"]) {
  switch (status) {
    case "connected":
      return "Connected";
    case "pending":
      return "Pending";
    case "error":
      return "Action required";
    default:
      return "Unknown";
  }
}
