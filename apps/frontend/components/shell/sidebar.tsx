"use client";

import { Suspense } from "react";

import { cn } from "../../lib/utils";
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
      <div className="mt-auto sticky bottom-0 border-t bg-background px-2 py-2">
        <UserMenu name={user.name} email={user.email} onSignOut={onSignOut} />
      </div>
    </aside>
  );
}
