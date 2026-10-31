import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const previousOrigin = process.env.CELOHT_ALLOWED_ORIGIN;

afterEach(() => {
  if (previousOrigin === undefined) delete process.env.CELOHT_ALLOWED_ORIGIN;
  else process.env.CELOHT_ALLOWED_ORIGIN = previousOrigin;
});

describe("API CORS", () => {
  it("allows credentialed preflight requests from the configured frontend", () => {
    process.env.CELOHT_ALLOWED_ORIGIN = "https://app.celoht.com";
    const request = new NextRequest("https://backend.example/api/v1/auth/verify", {
      method: "OPTIONS",
      headers: { origin: "https://app.celoht.com" },
    });

    const response = proxy(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.celoht.com");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("does not grant CORS access to other origins", () => {
    process.env.CELOHT_ALLOWED_ORIGIN = "https://app.celoht.com";
    const request = new NextRequest("https://backend.example/api/v1/profile", {
      headers: { origin: "https://untrusted.example" },
    });

    const response = proxy(request);

    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});