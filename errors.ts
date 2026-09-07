import { NextResponse } from "next/server";

/**
 * Standard, non-leaky API error envelope.
 * Never forwards raw database or third-party error messages to clients —
 * those are logged server-side via `logger.ts` and replaced here with a
 * stable, generic message + machine-readable code.
 */
export type ApiErrorCode =
  | "unauthenticated"
  | "unauthorized"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  unauthorized: 403,
  not_found: 404,
  validation_error: 422,
  conflict: 409,
  rate_limited: 429,
  service_unavailable: 503,
  internal_error: 500,
};

export function apiError(code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, details: details ?? null } },
    { status: STATUS_BY_CODE[code] }
  );
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/**
 * Wraps a route handler so that:
 * - ConfigurationError -> 503 (fail closed, never fake data)
 * - ZodError -> 422 with field details
 * - anything else -> logged server-side, 500 with a generic message
 */
export async function withApiErrorHandling(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err: unknown) {
    const { ConfigurationError } = await import("@/lib/config");
    if (err instanceof ConfigurationError) {
      // eslint-disable-next-line no-console
      console.error("[config] fail-closed:", err.message);
      return apiError("service_unavailable", "Service is not fully configured.");
    }

    const isZodError =
      typeof err === "object" && err !== null && "issues" in err && Array.isArray((err as { issues: unknown }).issues);
    if (isZodError) {
      return apiError("validation_error", "Request validation failed.", (err as { issues: unknown }).issues);
    }

    // eslint-disable-next-line no-console
    console.error("[unhandled]", err);
    return apiError("internal_error", "An unexpected error occurred.");
  }
}
