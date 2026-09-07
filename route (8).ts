import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { SESSION_COOKIE_NAME } from "@/lib/auth/authorization";

export async function POST() {
  return withApiErrorHandling(async () => {
    const res = apiOk({ loggedOut: true });
    res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return res;
  });
}
