export function isOwnedStoragePath(path: string, ownerId: string): boolean {
  if (!path.startsWith(`${ownerId}/`) || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}