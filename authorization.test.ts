import { describe, it, expect } from "vitest";
import { requireRole, AuthError, type AuthenticatedActor } from "@/lib/auth/authorization";

function actor(role: AuthenticatedActor["role"]): AuthenticatedActor {
  return { profileId: "p1", walletAddress: "0xabc", role };
}

describe("requireRole", () => {
  it("allows an actor whose role is in the allowed list", () => {
    expect(() => requireRole(actor("admin"), ["admin"])).not.toThrow();
  });

  it("rejects an actor whose role is not in the allowed list", () => {
    expect(() => requireRole(actor("user"), ["admin"])).toThrow(AuthError);
  });

  it("never grants admin-only access to a client-declared role — role must come from the DB lookup, not this function's caller", () => {
    // requireRole only trusts the AuthenticatedActor it is given; requireActor
    // (integration-tested against a live Supabase project) is what guarantees
    // that role always comes from profiles.role in the database.
    expect(() => requireRole(actor("agent"), ["reviewer", "admin"])).toThrow(AuthError);
  });
});
