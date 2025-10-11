"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/button";
import { api, isApiError } from "../../../../lib/api";

interface TenantStoreSummary {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  btcpayHost: string;
  walletSetupStatus: string;
  apiKeyManagedByTenant: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoreCardProps {
  tenantId: string;
  store: TenantStoreSummary;
}

export function StoreCard({ tenantId, store }: StoreCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [isRotating, startRotate] = useTransition();
  const [storeKeyLastFour, setStoreKeyLastFour] = useState<string | null>(store.storeKeyLastFour);

  const displayName = store.storeName?.trim().length ? store.storeName : "Unnamed store";
  const maskedKey = storeKeyLastFour ? `****${storeKeyLastFour}` : "Unavailable";
  const rotationDisabled = store.apiKeyManagedByTenant;

  const rotateKey = () => {
    if (rotationDisabled) {
      return;
    }
    setError(null);
    setStatus(null);

    startRotate(async () => {
      try {
        const payload = await api<RotateResponse>(
          `/tenants/${tenantId}/apikey/rotate?storeId=${store.storeId}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json"
            }
          }
        );

        const lastFour = typeof payload?.lastFour === "string" ? payload.lastFour : null;
        setStoreKeyLastFour(lastFour);
        setStatus("Internal API key rotated successfully.");
        router.refresh();
      } catch (submissionError) {
        setError(resolveActionError(submissionError, "Failed to rotate store API key."));
      }
    });
  };

  const handleDelete = () => {
    setError(null);
    setStatus(null);
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Delete this store from PayPay? All managed BTCPay credentials and webhooks will be revoked."
      );
      if (!confirmed) {
        return;
      }
    }

    startDelete(async () => {
      try {
        await api(`/tenants/${tenantId}/stores/${store.storeId}`, {
          method: "DELETE",
          headers: { Accept: "application/json" }
        });
        setStatus("Store deleted successfully.");
        router.refresh();
      } catch (submissionError) {
        setError(resolveActionError(submissionError, "Failed to delete store."));
      }
    });
  };

  return (
    <article className="rounded-xl border bg-card p-6 shadow-sm">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">{displayName}</h2>
        <p className="text-sm text-muted-foreground">
          Store ID <span className="font-mono text-foreground">{store.btcpayStoreId}</span>
        </p>
      </header>
      <dl className="mt-4 space-y-2 text-sm text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-foreground">BTCPay host</dt>
          <dd className="text-right">
            <a
              href={store.btcpayHost}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {store.btcpayHost}
            </a>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-foreground">API key</dt>
          <dd className="text-right font-mono text-foreground">{maskedKey}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-foreground">Wallet setup</dt>
          <dd className="text-right text-foreground">{formatWalletStatus(store.walletSetupStatus)}</dd>
        </div>
      </dl>
      {(error || status) && (
        <div
          className={`mt-4 rounded-md border px-4 py-2 text-sm ${
            error ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/5 text-foreground"
          }`}
        >
          {error ?? status}
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/tenants/${tenantId}/stores/${store.storeId}/dashboard`}>Open store</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/tenants/${tenantId}/stores/${store.storeId}/settings`}>View settings</Link>
        </Button>
        <Button
          type="button"
          onClick={rotateKey}
          disabled={rotationDisabled || isDeleting || isRotating}
          variant="secondary"
        >
          {rotationDisabled ? "Rotation disabled" : isRotating ? "Rotating…" : "Rotate key"}
        </Button>
        <Button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting || isRotating}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isDeleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {rotationDisabled && (
        <p className="mt-3 text-sm text-muted-foreground">
          Rotation is disabled because this store uses a merchant-managed credential. Rotate the key directly in BTCPay to
          refresh the connection.
        </p>
      )}
    </article>
  );
}

interface RotateResponse {
  lastFour?: string | null;
}

function resolveActionError(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const body = error.body as any;
    if (body && typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message.trim();
    }
    return `${fallback} (status ${error.status}).`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatWalletStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case "ready":
      return "Ready";
    case "pending":
      return "Pending setup";
    case "disabled":
      return "Disabled";
    default:
      return status;
  }
}
