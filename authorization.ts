import "server-only";
import { NextRequest } from "next/server";
import { verifySessionToken, SessionError } from "@/lib/auth/session";
import { getServiceRoleClient } from "@/lib/supabase/server";

export type Role = "user" | "agent" | "reviewer" | "admin";

export interface AuthenticatedActor {
  profileId: string;
  walletAddress: string;
  role: Role;
}

export class AuthError extends Error {
  constructor(public code: "unauthenticated" | "unauthorized", message: string) {
    super(message);
  }
}

const SESSION_COOKIE = "celoht_session";

/**
 * Resolves the authenticated actor for a request, or throws AuthError.
 * Role is always re-read from `profiles.role` in the database — never from
 * the session token's own claims and never from any client-sent header —
 * so a role change (e.g. suspension) takes effect immediately.
 */
export async function requireActor(req: NextRequest): Promise<AuthenticatedActor> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new AuthError("unauthenticated", "No session present.");

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch (err) {
    if (err instanceof SessionError) {
      throw new AuthError("unauthenticated", err.message);
    }
    throw err;
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, wallet_address, role")
    .eq("id", payload.sub)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AuthError("unauthenticated", "Profile no longer exists.");

  return { profileId: data.id, walletAddress: data.wallet_address, role: data.role as Role };
}

/** Throws AuthError("unauthorized") unless the actor has one of `roles`. */
export function requireRole(actor: AuthenticatedActor, roles: Role[]): void {
  if (!roles.includes(actor.role)) {
    throw new AuthError("unauthorized", `Requires one of roles: ${roles.join(", ")}`);
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
