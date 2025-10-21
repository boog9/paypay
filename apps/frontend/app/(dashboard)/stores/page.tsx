import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

type MockStore = {
  id: string;
  name: string;
  status: "connected" | "pending" | "error";
  emoji?: string;
  description: string;
  updatedAt: string;
};

const MOCK_STORES: MockStore[] = [
  {
    id: "espresso-bar",
    name: "Lightning Espresso",
    status: "connected",
    emoji: "⚡️",
    description: "Flagship café processing real-time payments via BTCPay invoices.",
    updatedAt: "Updated 2 hours ago",
  },
  {
    id: "noir-bakery",
    name: "Noir Bakery",
    status: "pending",
    emoji: "🥐",
    description: "Bakery onboarding in progress; awaiting webhook confirmation.",
    updatedAt: "Updated yesterday",
  },
  {
    id: "sat-stackers",
    name: "Sat Stackers",
    status: "error",
    emoji: "🪙",
    description: "Integration paused due to API key rotation requirements.",
    updatedAt: "Requires attention",
  },
];

export const metadata: Metadata = {
  title: "Stores",
  description: "Review and manage your BTCPay-connected stores.",
};

export default function StoresPage() {
  const hasStores = MOCK_STORES.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Stores</h1>
          <p className="text-sm text-muted-foreground">
            Manage every BTCPay store connected to your organization. Review status, credentials, and quick links to tenant
            settings.
          </p>
        </div>
        <Button asChild>
          <Link href="/stores/new">Create store</Link>
        </Button>
      </header>

      {hasStores ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MOCK_STORES.map((store) => {
            const status = getStatusMeta(store.status);
            return (
              <Card key={store.id} className="flex h-full flex-col justify-between border-border/60">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="text-2xl">
                        {store.emoji ?? "🏬"}
                      </span>
                      <div>
                        <CardTitle className="text-lg font-semibold leading-tight">{store.name}</CardTitle>
                        <CardDescription className="mt-1">{store.description}</CardDescription>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium",
                        status.badge
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("h-2 w-2 rounded-full", status.dot)}
                      />
                      {status.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{store.updatedAt}</p>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 border-t pt-4">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/tenants/${store.id}`}>Open tenant</Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/stores/${store.id}/dashboard`}>Manage</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed bg-muted/30">
          <CardHeader>
            <CardTitle>Create your first store</CardTitle>
            <CardDescription>
              Launch a BTCPay store to start issuing invoices, register webhooks, and manage credentials inside the PayPay
              portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild>
              <Link href="/stores/new">Create store</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getStatusMeta(status: MockStore["status"]) {
  switch (status) {
    case "connected":
      return { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500", label: "Connected" };
    case "pending":
      return { badge: "border-amber-500/30 bg-amber-500/10 text-amber-600", dot: "bg-amber-400", label: "Pending" };
    case "error":
      return { badge: "border-red-500/30 bg-red-500/10 text-red-600", dot: "bg-red-500", label: "Action required" };
    default:
      return { badge: "border-border bg-muted text-muted-foreground", dot: "bg-border", label: "Unknown" };
  }
}
