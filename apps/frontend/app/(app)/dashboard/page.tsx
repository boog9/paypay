import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "../../../components/ui/button";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function DashboardPage() {
  const stores: never[] = [];
  const hasStores = stores.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.
          </p>
        </header>
      </section>

      {hasStores ? (
        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-dashed bg-background/60 p-6 text-sm text-muted-foreground shadow-sm">
            Dashboard widgets will appear here once store analytics is connected.
          </article>
        </section>
      ) : (
        <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/40 p-12 text-center shadow-sm">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">No stores connected yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Create your first BTCPay store to unlock dashboards, API key provisioning and integration tooling managed by the
              portal backend.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/tenants">Create Store</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
