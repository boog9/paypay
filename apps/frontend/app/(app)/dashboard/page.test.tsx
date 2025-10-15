import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../../../components/shell/app-shell";
import DashboardPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("DashboardPage", () => {
  it("renders the dashboard empty state", () => {
    const view = DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/select a store/i)).toBeInTheDocument();
    expect(screen.getByText(/platform status: pending/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /create store/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/stores");
    expect(screen.getByText(/no stores connected yet/i)).toBeInTheDocument();
  });
});
