import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.
          </p>
        </header>

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
              <Link href="/stores">Create store</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
