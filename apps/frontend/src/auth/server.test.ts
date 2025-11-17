import { describe, expect, it, vi } from "vitest";

import { getCurrentUserSafe } from "./server";
import { bffFetch } from "@/lib/bff-fetch";

vi.mock("@/lib/bff-fetch", () => ({
  bffFetch: vi.fn(),
}));

describe("getCurrentUserSafe", () => {
  const mockBffFetch = vi.mocked(bffFetch);

  it("returns the user when /api/auth/me succeeds", async () => {
    const payload = { user: { id: "user-1", email: "ada@example.com", name: "Ada" } };
    mockBffFetch.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    const user = await getCurrentUserSafe();

    expect(user).toEqual({ id: "user-1", email: "ada@example.com", name: "Ada" });
    expect(mockBffFetch).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });
  });

  it("returns null when /api/auth/me responds with 401", async () => {
    mockBffFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }));

    const user = await getCurrentUserSafe();

    expect(user).toBeNull();
  });

  it("throws when /api/auth/me fails with an unexpected status", async () => {
    mockBffFetch.mockResolvedValueOnce(new Response("Server error", { status: 500, statusText: "Server Error" }));

    await expect(getCurrentUserSafe()).rejects.toThrow(/Failed to load auth session/);
  });
});
