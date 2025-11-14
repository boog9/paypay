"use client";

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { ShellSidebar } from "./sidebar";
import { StoreProvider } from "../../src/contexts/store-context";
import { WalletPresenceProvider } from "../../src/contexts/wallet-presence";

export function AppShell({
  children,
  walletHasWallet,
}: {
  children: ReactNode;
  walletHasWallet: boolean | null;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const params = useParams<Record<string, string | string[]>>();
  const rawStoreId = params?.storeId;
  const storeId = Array.isArray(rawStoreId) ? rawStoreId[0] ?? null : rawStoreId ?? null;

  const user = {
    name: "Ada Merchant",
    email: "ada.merchant@example.com",
  };

  return (
    <StoreProvider storeId={storeId}>
      <WalletPresenceProvider initial={walletHasWallet}>
        <div className="min-h-screen bg-muted/20">
          <a
            href="#main-content"
          className="sr-only focus-visible:absolute focus-visible:left-6 focus-visible:top-6 focus-visible:z-50 focus-visible:inline-flex focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-primary-foreground focus-visible:outline-none"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <ShellSidebar user={user} variant="desktop" />
          <div className="flex min-h-screen flex-1 flex-col">
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  aria-label="Open navigation"
                  className="fixed left-3 top-3 z-40 lg:hidden"
                  size="icon"
                  variant="ghost"
                >
                  <Menu aria-hidden="true" className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="h-full w-full max-w-xs border-r p-0">
                <ShellSidebar onNavigate={() => setIsMobileNavOpen(false)} user={user} variant="mobile" />
              </SheetContent>
            </Sheet>
            <main id="main-content" className="flex-1 overflow-y-auto p-6 pt-14 lg:p-8 lg:pt-8">
              {children}
            </main>
          </div>
        </div>
        </div>
      </WalletPresenceProvider>
    </StoreProvider>
  );
}
