"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Button } from "@/components/ui/button";

interface WalletActionsProps {
  storeId: string;
}

export function WalletActions({ storeId }: WalletActionsProps) {
  const rescanHref = `/stores/${storeId}/wallets/btc/rescan`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild aria-label="Wallet actions">
        <Button variant="outline" size="sm" aria-haspopup="menu">
          Actions
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-20 w-56 rounded-md border bg-popover p-1 text-sm shadow-lg" align="end">
          <DropdownMenu.Item
            asChild
            className="cursor-pointer select-none rounded-sm px-3 py-2 outline-none hover:bg-muted"
          >
            <Link href={rescanHref} role="menuitem">
              Rescan wallet…
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
