import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN = process.env.CELOHT_ALLOWED_ORIGIN;

export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const origin = request.headers.get("origin");
  const corsHeaders: Record<string, string> = {};

  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    corsHeaders["access-control-allow-origin"] = ALLOWED_ORIGIN;
    corsHeaders["access-control-allow-credentials"] = "true";
    corsHeaders["access-control-allow-methods"] = "GET,POST,PATCH,OPTIONS";
    corsHeaders["access-control-allow-headers"] = "content-type,x-request-id";
    corsHeaders.vary = "Origin";
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("cache-control", "no-store");

  for (const [name, value] of Object.entries(corsHeaders)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};