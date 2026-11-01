import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    data: {
      service: "CeloHT backend",
      apiBasePath: "/api/v1",
      healthPath: "/api/v1/health",
      governancePath: "/governance",
      links: [
        { rel: "health", href: "/api/v1/health", method: "GET" },
        { rel: "governance-api", href: "/api/v1/governance", method: "GET" },
        { rel: "governance-page", href: "/governance", method: "GET" },
        { rel: "auth-nonce", href: "/api/v1/auth/nonce", method: "POST" },
        { rel: "auth-verify", href: "/api/v1/auth/verify", method: "POST" },
        { rel: "auth-session", href: "/api/v1/auth/session", method: "GET" },
        { rel: "auth-logout", href: "/api/v1/auth/logout", method: "POST" },
      ],
    },
  });
}