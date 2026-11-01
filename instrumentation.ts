export async function register(): Promise<void> {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }

  const { getConfig } = await import("./config");
  getConfig();
}