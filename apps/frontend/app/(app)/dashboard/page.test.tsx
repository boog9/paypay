import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../../../components/shell/app-shell";
import DashboardPage from "./page";

type StoresQueryMockResult = {
  data: Array<{ id: string; name: string }>;
  isLoading: boolean;
  isError: boolean;
};

const useStoresQueryMock = vi.fn<() => StoresQueryMockResult>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
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

describe("DashboardPage", () => {
  beforeEach(() => {
    useStoresQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it("renders the dashboard empty state", () => {
    const view = DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/no stores connected yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create store/i })).not.toBeInTheDocument();
  });

  it("shows placeholder widgets when stores exist", () => {
    useStoresQueryMock.mockReturnValueOnce({
      data: [{ id: "1", name: "Store" }],
      isLoading: false,
      isError: false,
    });

    const view = DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/no stores connected yet/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dashboard-placeholder").length).toBeGreaterThan(0);
  });
});
