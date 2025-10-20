import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerReplace = vi.fn();
let pathnameValue: string | null = "/dashboard";
let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => pathnameValue,
  useSearchParams: () => ({
    get: (key: string) => searchParamsValue.get(key),
    toString: () => searchParamsValue.toString(),
  }),
}));

const refreshMock = vi.fn();
vi.mock("../../lib/auth", () => ({ refresh: refreshMock }));

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    AUTH_ME: "/api/auth/me",
  };
});

describe("AuthGate", () => {
  const originalFetch = globalThis.fetch;
  const globalWithFetch = globalThis as typeof globalThis & { fetch?: typeof fetch };

  beforeEach(() => {
    vi.resetModules();
    routerReplace.mockReset();
    refreshMock.mockReset();
    pathnameValue = "/dashboard";
    searchParamsValue = new URLSearchParams();
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalWithFetch.fetch;
    }
  });

  test("renders children once the session is confirmed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1", email: "test@example.com" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalWithFetch.fetch = fetchMock;

    const { AuthGate } = await import("./auth-gate");

    render(
      <AuthGate>
        <p>Protected</p>
      </AuthGate>
    );

    expect(await screen.findByText("Protected")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  test("refreshes the session once when the first call returns 401", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValue(
        new Response(JSON.stringify({ user: { id: "1", email: "test@example.com" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalWithFetch.fetch = fetchMock;
    refreshMock.mockResolvedValueOnce(undefined);

    const { AuthGate } = await import("./auth-gate");

    render(
      <AuthGate>
        <p>Protected</p>
      </AuthGate>
    );

    expect(await screen.findByText("Protected")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  test("redirects to sign-in when refresh fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    globalWithFetch.fetch = fetchMock;
    refreshMock.mockRejectedValueOnce(new Error("no session"));

    const { AuthGate } = await import("./auth-gate");

    render(
      <AuthGate>
        <p>Protected</p>
      </AuthGate>
    );

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/sign-in?next=%2Fdashboard");
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
