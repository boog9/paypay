import Link from "next/link";
import { CheckCircle2, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../components/ui/card";
import { Button } from "../../../../../../components/ui/button";

type StoreDashboardPageProps = {
  params: { storeId: string };
};

export default function StoreDashboardPage({ params }: StoreDashboardPageProps) {
  const { storeId } = params;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Store dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Review the initial setup tasks for your BTCPay store. You can revisit this dashboard anytime from the sidebar.
        </p>
      </header>

      <section aria-label="Store setup" className="grid gap-4 md:grid-cols-2">
        <Card className="border border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <CheckCircle2 aria-hidden className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Create your store</CardTitle>
              <CardDescription className="mt-1 text-emerald-700 dark:text-emerald-400">
                Your store is live and connected to BTCPay. Invite teammates and customize settings from the sidebar.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card className="border border-muted bg-background">
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wallet aria-hidden className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Set up a wallet</CardTitle>
              <CardDescription className="mt-1">
                Connect or generate a Bitcoin wallet to receive settlement from invoices issued by this store.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href={`/stores/${storeId}/wallets/btc`}>Go to BTC wallet</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
