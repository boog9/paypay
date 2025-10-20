import { describe, expect, test } from "vitest";

import { resolveNextDestination } from "./navigation";

describe("resolveNextDestination", () => {
  test("returns the home page when next is null", () => {
    expect(resolveNextDestination(null)).toBe("/");
  });

  test("returns the home page when the value is empty", () => {
    expect(resolveNextDestination("")).toBe("/");
  });

  test("rejects protocol-relative URLs", () => {
    expect(resolveNextDestination("//evil.com")).toBe("/");
  });

  test("rejects absolute URLs", () => {
    expect(resolveNextDestination("https://evil.com")).toBe("/");
  });

  test("allows in-app routes", () => {
    expect(resolveNextDestination("/dashboard")).toBe("/dashboard");
  });

  test("preserves query strings", () => {
    expect(resolveNextDestination("/dashboard?tab=1")).toBe("/dashboard?tab=1");
  });
});
