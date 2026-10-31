import { describe, expect, it } from "vitest";
import { GET } from "./app/route";

describe("GET /", () => {
  it("returns API discovery without claiming backend readiness", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      service: "CeloHT backend",
      apiBasePath: "/api/v1",
      healthPath: "/api/v1/health",
      governancePath: "/governance",
    });
    expect(body.data).not.toHaveProperty("status", "healthy");
  });
});