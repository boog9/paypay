"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import Link from "next/link";

import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type UserMenuProps = {
  name: string;
  email: string;
  onSignOut?: () => Promise<void> | void;
};

export function UserMenu({ name, email, onSignOut }: UserMenuProps) {
  const initials = getInitials(name || email);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          aria-label="Open user menu"
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-2 rounded-full border-input bg-background/80 px-3 py-1 text-sm font-medium"
        >
          <AvatarPrimitive.Root className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
            <AvatarPrimitive.Image className="h-full w-full rounded-full object-cover" alt="" />
            <AvatarPrimitive.Fallback delayMs={0}>{initials}</AvatarPrimitive.Fallback>
          </AvatarPrimitive.Root>
          <span className="hidden text-sm font-medium text-foreground sm:inline">{name}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          className="z-50 min-w-[220px] rounded-xl border bg-popover p-2 text-sm shadow-xl outline-none"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Signed in as
          </DropdownMenu.Label>
          <div className="px-2 pb-2 text-sm font-medium text-foreground">{name}</div>
          <div className="px-2 pb-2 text-xs text-muted-foreground">{email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link
              href="/account/profile"
              className={menuItemClass}
            >
              Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/account/security"
              className={menuItemClass}
            >
              Security
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={cn(menuItemClass, "text-destructive focus:bg-destructive/20 focus:text-destructive")}
            onSelect={(event) => {
              event.preventDefault();
              void onSignOut?.();
            }}
            role="menuitem"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuItemClass = "relative flex cursor-pointer select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus:bg-muted/80";

function getInitials(source: string) {
  const trimmed = source.trim();
  if (!trimmed) {
    return "U";
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "U";
  }
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts[parts.length - 1]?.charAt(0) ?? "";
  return `${first}${last}`.toUpperCase();
}
