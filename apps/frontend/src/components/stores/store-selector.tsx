"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { useStoresQuery, type StoreSummary } from "../../hooks/use-stores";
import { useStoreContext } from "../../contexts/store-context";

type StoreSelectorProps = {
  onStoreSelected?: () => void;
};

export function StoreSelector({ onStoreSelected }: StoreSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const { storeId: activeStoreIdFromContext } = useStoreContext();

  const storesQuery = useStoresQuery();
  const { data, isLoading, isError, error } = storesQuery;
  const [cachedStores, setCachedStores] = useState<StoreSummary[]>([]);

  useEffect(() => {
    if (Array.isArray(data)) {
      setCachedStores(data);
    }
  }, [data]);

  const stores = data ?? cachedStores;

  const normalizedStores = useMemo(() => stores, [stores]);

  const currentStoreId = useMemo(() => {
    if (activeStoreIdFromContext && normalizedStores.some((store) => store.id === activeStoreIdFromContext)) {
      return activeStoreIdFromContext;
    }
    return normalizedStores[0]?.id ?? null;
  }, [activeStoreIdFromContext, normalizedStores]);

  const filteredStores = useMemo(() => {
    if (!query.trim()) {
      return normalizedStores;
    }
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedStores.filter((store) => store.name.toLowerCase().includes(normalizedQuery));
  }, [normalizedStores, query]);

  const activeStore = useMemo(() => {
    if (!currentStoreId) {
      return null;
    }
    return normalizedStores.find((store) => store.id === currentStoreId) ?? null;
  }, [currentStoreId, normalizedStores]);

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
      const indexToHighlight = normalizedStores.findIndex((store) => store.id === currentStoreId);
      setHighlightedIndex(indexToHighlight >= 0 ? indexToHighlight : 0);
    } else {
      setQuery("");
    }
  }, [isOpen, normalizedStores, currentStoreId]);

  useEffect(() => {
    if (highlightedIndex >= filteredStores.length) {
      setHighlightedIndex(filteredStores.length ? filteredStores.length - 1 : 0);
    }
  }, [filteredStores.length, highlightedIndex]);

  const handleSelect = (storeId: string) => {
    if (!pathname) {
      return;
    }
    const match = pathname.match(/^\/stores\/(?:[^/]+)(\/.*)?$/);
    const suffix = match?.[1] ?? "/dashboard";
    const target = `/stores/${storeId}${suffix}`;
    router.replace(target, { scroll: false });
    setIsOpen(false);
    setQuery("");
    onStoreSelected?.();
  };

  const disableToggle = isLoading || !normalizedStores.length;

  const handleToggle = () => {
    if (disableToggle) {
      return;
    }
    setIsOpen((previous) => !previous);
  };

  const buttonLabel = isLoading ? "Loading stores…" : activeStore?.name ?? "No stores connected";
  const isRateLimited = error?.status === 429;
  const showGenericError = isError && !isRateLimited && !normalizedStores.length;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          (disableToggle || isLoading) && "cursor-default text-muted-foreground"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleToggle}
        disabled={disableToggle}
      >
        <span className="truncate">{buttonLabel}</span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.47018 6.52979C4.21083 6.27044 3.78872 6.27044 3.52937 6.52979C3.27003 6.78914 3.27003 7.21125 3.52937 7.4706L7.52937 11.4706C7.78872 11.73 8.21083 11.73 8.47018 11.4706L12.4702 7.4706C12.7295 7.21125 12.7295 6.78914 12.4702 6.52979C12.2108 6.27044 11.7887 6.27044 11.5294 6.52979L7.99977 10.0594L4.47018 6.52979Z"
            fill="currentColor"
          />
        </svg>
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          className="absolute z-50 mt-2 w-full rounded-xl border bg-popover p-2 shadow-xl"
        >
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
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
                    <span className="truncate">{store.name}</span>
                    {isActive ? <span className="text-xs text-muted-foreground">Selected</span> : null}
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No stores found</li>
            )}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button asChild size="sm" variant="ghost" className="justify-center">
              <Link href="/stores/new">Create store</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 rounded-lg bg-background/60">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      ) : null}

      {isRateLimited ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Too many requests, please try again in a few seconds.
        </p>
      ) : null}
      {showGenericError ? (
        <p className="mt-2 text-xs text-destructive">Failed to load stores.</p>
      ) : null}
    </div>
  );
}
