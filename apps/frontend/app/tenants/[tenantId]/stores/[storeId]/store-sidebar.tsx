"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface StoreSidebarItem {
  label: string;
  href: string;
}

export interface StoreSidebarSection {
  title: string;
  items: StoreSidebarItem[];
}

export function StoreSidebar({ sections }: { sections: StoreSidebarSection[] }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (!pathname) {
      return false;
    }
    if (pathname === href) {
      return true;
    }
    return pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="space-y-6">
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
