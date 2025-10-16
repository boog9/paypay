import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../../../components/shell/app-shell";
import DashboardPage from "./page";

type StoresQueryMockResult = {
  data: Array<{ id: string; name: string }>;
  isLoading: boolean;
  isError: boolean;
};

const {
  useStoresQueryMock,
  mockHeaders,
  mockCookies,
  redirectMock,
} = vi.hoisted(() => ({
  useStoresQueryMock: vi.fn<() => StoresQueryMockResult>(),
  mockHeaders: { get: vi.fn<(key: string) => string | null>() },
  mockCookies: { getAll: vi.fn<() => Array<{ name: string; value: string }>>() },
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/headers", () => ({
  headers: () => mockHeaders,
  cookies: () => mockCookies,
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../src/components/stores/store-selector", () => ({
  StoreSelector: ({ onStoreSelected }: { onStoreSelected?: () => void }) => (
    <button type="button" onClick={onStoreSelected}>
      Select store
    </button>
  ),
}));

vi.mock("../../../src/hooks/use-stores", () => ({
  useStoresQuery: useStoresQueryMock,
}));

const originalFetch = global.fetch;

describe("DashboardPage", () => {
  beforeEach(() => {
    useStoresQueryMock.mockReset();
    useStoresQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    redirectMock.mockReset();
    mockHeaders.get.mockImplementation((key: string) => {
      if (key === "x-forwarded-proto") return "https";
      if (key === "x-forwarded-host" || key === "host") return "paypay.test";
      return null;
    });
    mockCookies.getAll.mockReturnValue([]);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the dashboard empty state", async () => {
    const view = await DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/no stores connected yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create store/i })).not.toBeInTheDocument();
  });

  it("shows placeholder widgets when stores exist", async () => {
    useStoresQueryMock.mockReturnValueOnce({
      data: [{ id: "1", name: "Store" }],
      isLoading: false,
      isError: false,
    });

    const view = await DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/no stores connected yet/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dashboard-placeholder").length).toBeGreaterThan(0);
  });
});
