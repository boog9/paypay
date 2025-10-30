"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface WalletNavigationProps {
  basePath: string;
}

const NAV_ITEMS = [
  { segment: "transactions", label: "Transactions" },
  { segment: "send", label: "Send" },
  { segment: "receive", label: "Receive" },
  { segment: "settings", label: "Settings" }
] as const;

export function WalletNavigation({ basePath }: WalletNavigationProps) {
  const pathname = usePathname();
  const normalizedPathname = pathname?.replace(/\/$/, "");

  return (
    <nav className="flex flex-wrap gap-2 border-b border-border/60 pb-2">
      {NAV_ITEMS.map((item) => {
        const href = `${basePath}/${item.segment}`;
        const isActive = normalizedPathname === href;
        return (
          <Link
            key={item.segment}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
