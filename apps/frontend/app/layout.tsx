import "./globals.css";
import { ReactNode } from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "PayPay Merchant Portal",
  description: "Control center for BTCPay-connected merchants"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b bg-card/40 backdrop-blur">
            <div className="container flex items-center justify-between py-4">
              <span className="text-lg font-semibold">PayPay Portal</span>
              <nav className="flex gap-4 text-sm text-muted-foreground">
                <a href="/login" className="hover:text-foreground">
                  Sign in
                </a>
                <a href="/signup" className="hover:text-foreground">
                  Create account
                </a>
              </nav>
            </div>
          </header>
          <main className="container flex-1 py-10">{children}</main>
          <footer className="border-t py-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} PayPay. BTCPay Server native integration.
          </footer>
        </div>
      </body>
    </html>
  );
}
