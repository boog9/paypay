import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../../../components/shell/app-shell";
import DashboardPage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: pushMock,
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

describe("DashboardPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("renders the dashboard empty state", () => {
    const view = DashboardPage();
    render(<AppShell>{view}</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: /create store/i });
    const primaryCta = ctas.find((link) => link.getAttribute("href") === "/stores");
    expect(primaryCta).toBeDefined();
    expect(primaryCta).toHaveAttribute("href", "/stores");
    expect(screen.getByText(/no stores connected yet/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
