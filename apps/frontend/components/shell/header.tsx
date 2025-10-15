"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { UserMenu } from "../user-menu";

type ShellHeaderProps = {
  mobileNavigationTrigger: ReactNode;
  user: {
    name: string;
    email: string;
  };
};

export function ShellHeader({ mobileNavigationTrigger, user }: ShellHeaderProps) {
  return (
    <header
      aria-label="Application top bar"
      className="flex h-16 items-center justify-between border-b bg-background/90 px-6 backdrop-blur lg:h-20 lg:px-8"
    >
      <div className="flex items-center gap-3">
        <div className="lg:hidden">{mobileNavigationTrigger}</div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          PayPay Portal
        </Link>
      </div>
      <UserMenu name={user.name} email={user.email} />
    </header>
  );
}
