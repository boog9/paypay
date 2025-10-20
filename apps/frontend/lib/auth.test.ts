import { afterEach, beforeEach, expect, test, vi } from "vitest";

const ORIGINAL_FETCH = global.fetch;
const TEST_BFF_URL = "https://bff.test";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_FETCH) {
    global.fetch = ORIGINAL_FETCH;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).fetch;
  }
  delete process.env.NEXT_PUBLIC_BFF_URL;
  vi.restoreAllMocks();
});

test("getCsrfToken prefers header value", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
    return new Response(null, {
      status: 200,
      headers: { "X-Csrf-Token": "header-token" },
    });
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const { getCsrfToken } = await import("./auth");

  const token = await getCsrfToken();
  expect(token).toBe("header-token");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = fetchMock.mock.calls[0];
  expect(init?.credentials).toBe("include");
  expect(init?.mode).toBe("cors");
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  expect(headers.get("Accept")).toBe("application/json");
  expect(headers.has("Content-Type")).toBe(false);
});

test("getCsrfToken falls back to JSON payload", async () => {
  process.env.NEXT_PUBLIC_BFF_URL = TEST_BFF_URL;

  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({ csrfToken: "json-token" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const { getCsrfToken } = await import("./auth");

  const token = await getCsrfToken();
  expect(token).toBe("json-token");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
