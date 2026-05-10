import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isProtectedPageRoute = createRouteMatcher([
  "/account(.*)",
  "/admin(.*)",
]);

const isClerkApiRuntimeRoute = createRouteMatcher([
  "/api/account(.*)",
  "/api/admin(.*)",
  "/api/desktop/account(.*)",
  "/api/desktop/transcribe(.*)",
  "/api/stripe/checkout(.*)",
  "/api/stripe/portal(.*)",
]);

const isClerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
);

const clerkProtectedProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedPageRoute(request)) {
    await auth.protect();
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isClerkConfigured || !shouldRunClerkProxy(request)) {
    return NextResponse.next();
  }

  return clerkProtectedProxy(request, event);
}

function shouldRunClerkProxy(request: NextRequest) {
  if (isProtectedPageRoute(request)) {
    return true;
  }

  return isClerkApiRuntimeRoute(request) && hasClerkSessionCookie(request);
}

function hasClerkSessionCookie(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  return /(?:^|;\s*)(?:__session|__client|__clerk|clerk_)/.test(cookieHeader);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
