import type { Metadata } from "next";
import Link from "next/link";

import { StoreSelector } from "../../../components/store-selector";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.",
};

export default function DashboardPage() {
  const stores: never[] = [];
  const hasStores = stores.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active store</p>
          <StoreSelector />
        </div>
        <Badge variant="outline" className="text-xs font-medium">
          Platform status: Pending
        </Badge>
      </section>

      <section className="space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.
          </p>
        </header>

        {hasStores ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card className="border-dashed bg-muted/40">
              <CardHeader>
                <CardTitle className="text-base">Store analytics</CardTitle>
                <CardDescription>Widgets will appear here once data is connected.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle>No stores connected yet</CardTitle>
              <CardDescription>
                Create your first BTCPay store to unlock dashboards, API key provisioning and integration tooling managed by the
                portal backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild>
                <Link href="/stores">Create Store</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
