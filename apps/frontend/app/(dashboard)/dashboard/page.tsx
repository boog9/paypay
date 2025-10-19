import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardContent } from "../../../src/components/dashboard/dashboard-content";
import { API_PREFIX, BFF, apiFetch } from "../../../lib/api";

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
  const serializedCookies = headerList.get("cookie") ?? "";

  const requestHeaders = new Headers({ Accept: "application/json" });
  if (serializedCookies) {
    requestHeaders.set("cookie", serializedCookies);
  }

  const response: Response = await apiFetch(`${API_PREFIX}/auth/me`, {
    method: "GET",
    headers: requestHeaders,
    cache: "no-store",
    baseUrl: BFF || fallbackOrigin
  });

  if (response.status === 401) {
    redirect("/login");
  }

  if (!response.ok) {
    throw new Error("Failed to verify authenticated session.");
  }

  if (response.status !== 204) {
    await response.text().catch(() => undefined);
  }
}
