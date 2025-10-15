"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { ShellHeader } from "./header";
import { ShellSidebar } from "./sidebar";
import type { StoreOption } from "../store-selector";

export function AppShell({ children }: { children: ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const pathname = usePathname();

  const stores = useMemo<StoreOption[]>(
    () => [
      { id: "espresso-bar", name: "Lightning Espresso", status: "connected", emoji: "⚡️" },
      { id: "noir-bakery", name: "Noir Bakery", status: "pending", emoji: "🥐" },
      { id: "sat-stackers", name: "Sat Stackers", status: "error", emoji: "🪙" },
    ],
    []
  );

  const activeStoreId = useMemo(() => {
    if (!pathname) {
      return stores[0]?.id;
    }
    const matchedStore = stores.find((store) =>
      pathname.startsWith(`/tenants/${store.id}`) || pathname.startsWith(`/stores/${store.id}`)
    );
    return matchedStore?.id ?? stores[0]?.id;
  }, [pathname, stores]);

  const user = {
    name: "Ada Merchant",
    email: "ada.merchant@example.com",
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <a
        href="#main-content"
        className="sr-only focus-visible:absolute focus-visible:left-6 focus-visible:top-6 focus-visible:z-50 focus-visible:inline-flex focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-primary-foreground focus-visible:outline-none"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <ShellSidebar stores={stores} activeStoreId={activeStoreId} variant="desktop" />
        <div className="flex min-h-screen flex-1 flex-col">
          <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <ShellHeader
              mobileNavigationTrigger={
                <SheetTrigger asChild>
                  <Button
                    aria-label="Open navigation menu"
                    className="lg:hidden"
                    size="icon"
                    variant="ghost"
                  >
                    <Menu aria-hidden="true" className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
              }
              user={user}
            />
            <Separator className="lg:hidden" />
            <main id="main-content" className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
                {children}
              </div>
            </main>
            <SheetContent side="left" className="w-full max-w-xs border-r p-0">
              <ShellSidebar
                onNavigate={() => setIsMobileNavOpen(false)}
                stores={stores}
                activeStoreId={activeStoreId}
                variant="mobile"
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
