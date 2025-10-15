import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarNav } from "../sidebar-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/stores/alpha",
}));

describe("SidebarNav", () => {
  it("marks parent route active for nested paths", () => {
    render(
      <SidebarNav
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Stores", href: "/stores" },
        ]}
      />
    );

    const storesLink = screen.getByRole("link", { name: "Stores" });
    expect(storesLink).toHaveAttribute("aria-current", "page");
    expect(storesLink.className).toContain("bg-primary/10");
  });
});
