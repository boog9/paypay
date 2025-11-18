"use client";

import { FormEvent, type ReactElement, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { rescanBtcWallet } from "@/lib/api/btc-wallet-actions";

interface PageParams {
  tenantId: string;
  storeId: string;
}

export default function RescanPage({ params }: { params: PageParams }): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [startIndex, setStartIndex] = useState<number>(0);
  const [gapLimit, setGapLimit] = useState<number>(10_000);
  const [batchSize, setBatchSize] = useState<number>(3_000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await rescanBtcWallet(params.storeId, { startIndex, gapLimit, batchSize });
      toast({
        title: "Rescan started",
        description: "BTCPay is rescanning your on-chain wallet. This may take a while."
      });
      router.push(`/tenants/${params.tenantId}/stores/${params.storeId}/wallets/bitcoin/settings`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start rescan";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = (): void => {
    router.push(`/tenants/${params.tenantId}/stores/${params.storeId}/wallets/bitcoin/settings`);
  };

  const parseInput = (value: string, fallback: number, min = 0): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }
    return Math.trunc(parsed);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rescan wallet</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Start a new scan to import any transactions that were missed because of gap limit issues or restored history. No
          wallet secrets are sent to the portal.
        </p>
        {error ? <div className="mb-4 text-sm text-destructive">{error}</div> : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Starting index</span>
              <Input
                type="number"
                min={0}
                value={startIndex}
                onChange={(event) => setStartIndex(parseInput(event.target.value, 0, 0))}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Gap limit</span>
              <Input
                type="number"
                min={0}
                value={gapLimit}
                onChange={(event) => setGapLimit(parseInput(event.target.value, 10_000, 0))}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Batch size</span>
              <Input
                type="number"
                min={1}
                value={batchSize}
                onChange={(event) => setBatchSize(parseInput(event.target.value, 3_000, 1))}
              />
            </label>
          </div>
          <div className="flex flex-row gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Starting rescan…" : "Start scan"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
