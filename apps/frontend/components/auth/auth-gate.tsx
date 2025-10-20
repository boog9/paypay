"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AUTH_ME } from "../../lib/api";
import { refresh } from "../../lib/auth";

type AuthGateStatus = "pending" | "authorized";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<AuthGateStatus>("pending");
  const hasRefreshedRef = useRef(false);

  const serializedSearch = searchParams?.toString() ?? "";
  const nextLocation = useMemo(() => {
    const path = pathname ?? "/";
    const query = serializedSearch ? `?${serializedSearch}` : "";
    const combined = `${path}${query}`;
    return combined || "/";
  }, [pathname, serializedSearch]);

  const apiBase = useMemo(() => (process.env.NEXT_PUBLIC_BFF_URL ?? "").replace(/\/$/, ""), []);
  const meEndpoint = useMemo(() => `${apiBase}${AUTH_ME}`, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    hasRefreshedRef.current = false;

    const redirectToSignIn = () => {
      if (cancelled) {
        return;
      }
      const target = encodeURIComponent(nextLocation || "/");
      router.replace(`/sign-in?next=${target}`);
    };

    const verifySession = async () => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          controller?.abort();
          controller = new AbortController();
          const response = await fetch(meEndpoint, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });

          if (cancelled) {
            controller = null;
            return;
          }

          if (response.ok) {
            setStatus("authorized");
            controller = null;
            return;
          }

          if (
            (response.status === 401 || response.status === 403) &&
            attempt === 1 &&
            !hasRefreshedRef.current
          ) {
            hasRefreshedRef.current = true;
            try {
              await refresh();
            } catch {
              redirectToSignIn();
              controller = null;
              return;
            }

            if (cancelled) {
              controller = null;
              return;
            }

            controller = null;
            continue;
          }

          redirectToSignIn();
          controller = null;
          return;
        } catch (error) {
          if (cancelled) {
            controller = null;
            return;
          }

          if (error instanceof DOMException && error.name === "AbortError") {
            controller = null;
            return;
          }

          redirectToSignIn();
          controller = null;
          return;
        }
      }
    };

    void verifySession();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [meEndpoint, nextLocation, router]);

  if (status !== "authorized") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
        <span className="sr-only">Checking session…</span>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
      </div>
    );
  }

  return <>{children}</>;
}
