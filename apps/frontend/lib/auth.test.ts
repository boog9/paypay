import { afterEach, beforeEach, expect, test, vi } from "vitest";

const TEST_BFF_URL = "https://bff.test";
const originalFetch: typeof fetch | undefined = globalThis.fetch;

type GlobalWithFetch = typeof globalThis & { fetch?: typeof fetch };
type FetchInitLike = {
  credentials?: string;
  mode?: string;
  headers?: HeadersInit;
};

function isHeadersInit(value: unknown): value is HeadersInit {
  if (value instanceof Headers) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
    );
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).every(
      (headerValue) => typeof headerValue === "string"
    );
  }

  return false;
}

function isFetchInitLike(value: unknown): value is FetchInitLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    credentials?: unknown;
    mode?: unknown;
    headers?: unknown;
  };

  const credentialsValid =
    candidate.credentials === undefined || typeof candidate.credentials === "string";
  const modeValid = candidate.mode === undefined || typeof candidate.mode === "string";
  const headersValid = candidate.headers === undefined || isHeadersInit(candidate.headers);

  return credentialsValid && modeValid && headersValid;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as GlobalWithFetch).fetch;
  }
  delete process.env.NEXT_PUBLIC_BFF_URL;
  vi.restoreAllMocks();
});

test("getCsrfToken prefers header value", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(() =>
    Promise.resolve(
      new Response(null, {
        status: 200,
        headers: { "X-Csrf-Token": "header-token" },
      })
    )
  );

  globalThis.fetch = fetchMock;

  const { getCsrfToken } = await import("./auth");

  const token = await getCsrfToken();
  expect(token).toBe("header-token");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const firstCall = fetchMock.mock.calls[0];
  if (!Array.isArray(firstCall)) {
    throw new Error("Unexpected fetch call arguments");
  }

  const [, init] = firstCall;
  if (!isFetchInitLike(init)) {
    throw new Error("Unexpected RequestInit payload");
  }

  const typedInit: FetchInitLike = init;

  expect(typedInit.credentials).toBe("include");
  expect(typedInit.mode).toBe("cors");
  const headersInit: HeadersInit = typedInit.headers ?? [];
  const headers = new Headers(headersInit);
  expect(headers.get("Accept")).toBe("application/json");
  expect(headers.has("Content-Type")).toBe(false);
});

test("getCsrfToken falls back to JSON payload", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ csrfToken: "json-token" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )
  );

  globalThis.fetch = fetchMock;

  const { getCsrfToken } = await import("./auth");

  const token = await getCsrfToken();
  expect(token).toBe("json-token");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
