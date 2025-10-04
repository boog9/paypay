"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui/button";
import { api, isApiError } from "../../../../../../lib/api";

interface StoreSettingsData {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  apiKeyManagedByTenant: boolean;
}

interface StoreSettingsClientProps {
  tenantId: string;
  storeId: string;
  initialData: StoreSettingsData;
}

interface RotateResponse {
  lastFour?: string | null;
}

export default function StoreSettingsClient({
  tenantId,
  storeId,
  initialData
}: StoreSettingsClientProps) {
  const [data, setData] = useState<StoreSettingsData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isRotating, startRotate] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();

  const maskedKey = data.storeKeyLastFour ? `****${data.storeKeyLastFour}` : "Unavailable";
  const rotationDisabled = data.apiKeyManagedByTenant;

  const rotateKey = () => {
    if (rotationDisabled) {
      return;
    }
    setError(null);
    setStatus(null);
    startRotate(async () => {
      try {
        const payload = await api<RotateResponse>(
          `/tenants/${tenantId}/apikey/rotate?storeId=${storeId}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json"
            }
          }
        );

        const lastFour = typeof payload?.lastFour === "string" ? payload.lastFour : null;
        setData((prev) => ({ ...prev, storeKeyLastFour: lastFour }));
        setStatus("Store API key rotated successfully.");
      } catch (error) {
        setError(resolveActionError(error, "Failed to rotate store API key."));
      }
    });
  };

  const deleteStore = () => {
    setError(null);
    setStatus(null);
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        rotationDisabled
          ? "Delete this store from the portal? Your BTCPay API key will remain active."
          : "Delete this store and revoke its BTCPay access?"
      );
      if (!confirmed) {
        return;
      }
    }

    startDelete(async () => {
      try {
        await api(`/tenants/${tenantId}/stores/${storeId}`, {
          method: "DELETE",
          headers: {
            Accept: "application/json"
          }
        });

        setStatus("Store deleted. Redirecting...");
        router.push("/");
      } catch (error) {
        setError(resolveActionError(error, "Failed to delete store."));
      }
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Store settings</h1>
          <p className="text-sm text-muted-foreground">
            Review the metadata provisioned for this BTCPay Store. API keys are masked and managed exclusively by the backend.
          </p>
        </header>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {status && !error && (
          <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
            {status}
          </div>
        )}
        <dl className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">BTCPay Store ID</dt>
            <dd className="mt-1 font-medium text-sm text-foreground break-words">{data.btcpayStoreId}</dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Display name</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {data.storeName ? data.storeName : "Not set"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Website</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {data.storeWebsite ? (
                <a
                  href={data.storeWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {data.storeWebsite}
                </a>
              ) : (
                "Not set"
              )}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Store API key</dt>
            <dd className="mt-1 text-sm font-mono text-foreground">{maskedKey}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Button disabled={rotationDisabled || isRotating || isDeleting} onClick={rotateKey}>
            {rotationDisabled ? "Rotation disabled" : isRotating ? "Rotating…" : "Rotate Key"}
          </Button>
          <Button
            disabled={isRotating || isDeleting}
            onClick={deleteStore}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting…" : "Delete Store"}
          </Button>
        </div>
        {rotationDisabled && (
          <p className="text-sm text-muted-foreground">
            Rotation is unavailable because this store uses a merchant-supplied API key. Generate a new key in BTCPay and update
            the connection from the portal onboarding flow.
          </p>
        )}
      </div>
    </div>
  );
}

function resolveActionError(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const body = error.body as any;
    if (body && typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message.trim();
    }
    if (typeof body === "string" && body.trim().length > 0) {
      return body.trim();
    }
    return `${fallback} (status ${error.status})`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
