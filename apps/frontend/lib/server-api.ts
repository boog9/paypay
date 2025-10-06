import { cookies } from "next/headers";
import { getBffApiBaseUrl } from "./bff";

function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path;
}

export async function fetchFromBff(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = getBffApiBaseUrl();
  const url = `${baseUrl}${normalizePath(path)}`;
  const cookieStore = await cookies();
  const serializedCookies = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const headers = new Headers(init.headers ?? {});
  if (serializedCookies && !headers.has("cookie") && !headers.has("Cookie")) {
    headers.set("Cookie", serializedCookies);
  }
  if (!headers.has("accept") && !headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return fetch(url, {
    ...init,
    cache: init.cache ?? "no-store",
    headers
  });
}
