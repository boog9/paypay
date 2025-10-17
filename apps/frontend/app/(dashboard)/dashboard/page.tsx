import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardContent } from "../../../src/components/dashboard/dashboard-content";
import { API_PREFIX, BFF } from "../../../lib/api";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Review the health of your BTCPay stores, quick actions and credentials once they are connected to the portal.",
};

export default async function DashboardPage() {
  await ensureAuthenticated();
  return <DashboardContent />;
}

async function ensureAuthenticated(): Promise<void> {
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const forwardedHost = headerList.get("x-forwarded-host");
  const host = forwardedHost ?? headerList.get("host");
  const fallbackOrigin = host ? `${proto}://${host}` : "http://localhost";
  const baseOrigin = BFF || fallbackOrigin;
  const target = new URL(`${API_PREFIX}/auth/me`, baseOrigin);

  const serializedCookies = headerList.get("cookie") ?? "";

  const requestHeaders = new Headers({ Accept: "application/json" });
  if (serializedCookies) {
    requestHeaders.set("cookie", serializedCookies);
  }

  const response = await fetch(target.toString(), {
    method: "GET",
    headers: requestHeaders,
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/login");
  }

  if (!response.ok) {
    throw new Error("Failed to verify authenticated session.");
  }

  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      await response.json().catch(() => undefined);
    } else {
      await response.arrayBuffer().catch(() => undefined);
    }
  }
}
