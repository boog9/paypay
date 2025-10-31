import { cookies } from "next/headers";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "X-CSRF-Token";
const CSRF_PATH = "/api/auth/csrf";

type ExtendedRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

function normalizePath(path: string): string {
  if (!path) {
    throw new Error("BFF path must be provided.");
  }
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  if (path !== "/api" && !path.startsWith("/api/")) {
    throw new Error(`BFF requests must target the /api prefix. Received: ${path}`);
  }
  return path;
}

function resolveBffBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_BFF_URL?.trim();
  if (!raw) {
    return "";
  }
  return raw.replace(/\/$/, "");
}

function buildBffUrl(path: string): string {
  const normalizedPath = normalizePath(path);
  const base = resolveBffBaseUrl();
  if (!base) {
    return normalizedPath;
  }
  return `${base}${normalizedPath}`;
}

function encodeCookieValue(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    return value;
  }
}

async function serializeCookies(): Promise<string | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  const store = await cookies();
  const jar = store.getAll();
  if (!jar.length) {
    return null;
  }
  return jar
    .map((entry) => `${entry.name}=${encodeCookieValue(entry.value)}`)
    .join("; ");
}

async function ensureCsrfToken(headers: Headers, cookieHeader: string | null): Promise<void> {
  if (headers.has(CSRF_HEADER) || headers.has(CSRF_HEADER.toLowerCase())) {
    return;
  }

  const target = buildBffUrl(CSRF_PATH);
  const csrfHeaders = new Headers({ Accept: "application/json" });
  if (cookieHeader) {
    csrfHeaders.set("Cookie", cookieHeader);
  }

  try {
    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
      headers: csrfHeaders,
      credentials: "include",
    });
    const token = response.headers.get(CSRF_HEADER);
    if (token) {
      headers.set(CSRF_HEADER, token);
    }
  } catch {
    // Ignore CSRF bootstrap failures; the subsequent request may still succeed
    // if the caller provided the token manually.
  }
}

export async function bffFetch(path: string, init: ExtendedRequestInit = {}): Promise<Response> {
  const cookieHeader = await serializeCookies();
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("accept")) {
    headers.set("Accept", "application/json");
  }
  if (cookieHeader && !headers.has("cookie")) {
    headers.set("Cookie", cookieHeader);
  }

  const method = (init.method ?? "GET").toString().toUpperCase();
  if (!SAFE_METHODS.has(method)) {
    await ensureCsrfToken(headers, cookieHeader);
  }

  const target = buildBffUrl(path);
  const requestInit: ExtendedRequestInit = {
    ...init,
    method,
    headers,
    cache: "no-store",
    credentials: "include",
  };

  if (!requestInit.next) {
    requestInit.next = { revalidate: 0 };
  } else if (requestInit.next.revalidate === undefined) {
    requestInit.next = { ...requestInit.next, revalidate: 0 };
  }

  return fetch(target, requestInit);
}
