import { describe, it, expect } from "vitest";
import { isRateLimited } from "@/lib/rateLimit";

describe("isRateLimited", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, 5, 60_000)).toBe(false);
    }
  });

  it("blocks requests over the limit within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) isRateLimited(key, 5, 60_000);
    expect(isRateLimited(key, 5, 60_000)).toBe(true);
  });
});
