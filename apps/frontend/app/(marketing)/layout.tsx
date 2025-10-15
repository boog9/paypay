import type { ReactNode } from "react";
import Link from "next/link";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card/40 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link
            href="/"
            className="text-lg font-semibold text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            PayPay Portal
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link
              href="/sign-in"
              className="transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>
      <main className="container flex-1 py-10">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {year} PayPay. BTCPay Server native integration.
      </footer>
    </div>
  );
}
