import "./globals.css";
import { ReactNode } from "react";
import { Metadata } from "next";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PayPay Merchant Portal",
  description: "Control center for BTCPay-connected merchants"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
