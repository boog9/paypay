"use client";

import { Suspense } from "react";

import { cn } from "../../lib/utils";
import { StoreSelector } from "../../src/components/stores/store-selector";

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
      <div className="px-4 pb-4 pt-5 lg:px-5">
        <Suspense fallback={<div className="h-10 rounded-lg bg-muted" />}>
          <StoreSelector onStoreSelected={onNavigate} />
        </Suspense>
      </div>
    </aside>
  );
}
