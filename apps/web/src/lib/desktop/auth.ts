import "server-only";

import {
  readDesktopBearerToken,
  verifyDesktopToken,
} from "@/lib/desktop/tokens";

export type DesktopAuthState =
  | Readonly<{ ok: true; clerkUserId: string }>
  | Readonly<{
      ok: false;
      reason: "missing_token" | "invalid_token" | "expired_token";
    }>;

export function requireDesktopUserId(
  request: Pick<Request, "headers">,
): DesktopAuthState {
  const token = readDesktopBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  const result = verifyDesktopToken(token);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === "expired" ? "expired_token" : "invalid_token",
    };
  }

  return { ok: true, clerkUserId: result.clerkUserId };
}
