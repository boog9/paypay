import { afterEach, beforeEach, expect, test, vi } from "vitest";

const TEST_BFF_URL = "https://bff.test";
const originalFetch: typeof fetch | undefined = globalThis.fetch;

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) {
    return null;
  }
  const headers = new Headers(init.headers);
  const value = headers.get(name);
  return value ? value : null;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    Reflect.deleteProperty(globalThis as GlobalWithFetch, "fetch");
  }
  delete process.env.NEXT_PUBLIC_BFF_URL;
  vi.restoreAllMocks();
});

test("api retries once after refreshing tokens on a 401 response", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn<typeof fetch>();
  fetchMock
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/example`);
      expect(headerValue(init, "X-CSRF-Token")).toBeNull();
      return Promise.resolve(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/auth/csrf`);
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
      return Promise.resolve(
        new Response(null, {
          status: 204,
          headers: { "X-Csrf-Token": "csrf-initial" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/auth/refresh`);
      expect((init?.method ?? "POST").toUpperCase()).toBe("POST");
      expect(headerValue(init, "X-CSRF-Token")).toBe("csrf-initial");
      return Promise.resolve(
        new Response(null, {
          status: 204,
          headers: { "X-Csrf-Token": "csrf-updated" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/example`);
      expect(headerValue(init, "X-CSRF-Token")).toBe("csrf-updated");
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const { api, getCachedCsrfToken } = await import("./api");

  const payload = await api<{ ok: boolean }>("/api/example");
  expect(payload).toEqual({ ok: true });
  expect(getCachedCsrfToken()).toBe("csrf-updated");
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("api refreshes CSRF even when a token is already cached", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn<typeof fetch>();
  fetchMock
    .mockImplementationOnce((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/ping`);
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "X-Csrf-Token": "initial-csrf",
          },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/needs-refresh`);
      expect(headerValue(init, "X-CSRF-Token")).toBe("initial-csrf");
      return Promise.resolve(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/auth/csrf`);
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
      return Promise.resolve(
        new Response(null, {
          status: 204,
          headers: { "X-Csrf-Token": "refreshed-csrf" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/auth/refresh`);
      expect((init?.method ?? "POST").toUpperCase()).toBe("POST");
      expect(headerValue(init, "X-CSRF-Token")).toBe("refreshed-csrf");
      return Promise.resolve(
        new Response(null, {
          status: 204,
          headers: { "X-Csrf-Token": "refreshed-csrf-2" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/needs-refresh`);
      expect(headerValue(init, "X-CSRF-Token")).toBe("refreshed-csrf-2");
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const { api, getCachedCsrfToken } = await import("./api");

  const ping = await api<{ ok: boolean }>("/api/ping");
  expect(ping).toEqual({ ok: true });
  expect(getCachedCsrfToken()).toBe("initial-csrf");

  const payload = await api<{ ok: boolean }>("/api/needs-refresh");
  expect(payload).toEqual({ ok: true });
  expect(getCachedCsrfToken()).toBe("refreshed-csrf-2");
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

test("api throws original 401 error when refresh fails", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn<typeof fetch>();
  fetchMock
    .mockImplementationOnce((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/example`);
      return Promise.resolve(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/auth/csrf`);
      return Promise.resolve(
        new Response(null, {
          status: 204,
          headers: { "X-Csrf-Token": "csrf-token" },
        }),
      );
    })
    .mockImplementationOnce((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      expect(url).toBe(`${TEST_BFF_URL}/api/auth/refresh`);
      return Promise.resolve(
        new Response(JSON.stringify({ message: "forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      );
    });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const { api, ApiError } = await import("./api");

  let caught: unknown;
  try {
    await api("/api/example");
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(ApiError);
  expect((caught as InstanceType<typeof ApiError>).status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
