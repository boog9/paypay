import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";
import { AppShell } from "../../../components/shell/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard"
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("DashboardPage", () => {
  it("renders the shell sections", async () => {
    const view = await DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByLabelText(/main navigation/i)).toBeInTheDocument();
    expect(screen.getByRole("banner", { name: /dashboard header/i })).toBeInTheDocument();
    expect(screen.getByText(/no stores connected yet/i)).toBeInTheDocument();
  });
});
