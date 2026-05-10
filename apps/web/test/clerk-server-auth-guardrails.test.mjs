import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const accountPagePath = path.join("src", "app", "account", "page.tsx");
const adminPagePath = path.join("src", "app", "admin", "page.tsx");

test("Next 16 Clerk proxy protects account and admin page routes", async () => {
  const proxy = await readFile(path.join("src", "proxy.ts"), "utf8");

  await assert.rejects(access(path.join("src", "middleware.ts")));
  assert.match(
    proxy,
    /import\s+\{\s*clerkMiddleware,\s*createRouteMatcher\s*\}\s+from\s+["']@clerk\/nextjs\/server["']/,
  );
  assert.match(proxy, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(proxy, /NextResponse\.next\(\)/);
  assert.match(proxy, /const\s+clerkProtectedProxy\s*=\s*clerkMiddleware/);
  assert.match(proxy, /createRouteMatcher\(\[\s*["']\/account\(\.\*\)["']/);
  assert.match(proxy, /["']\/admin\(\.\*\)["']/);
  assert.match(proxy, /const\s+isClerkApiRuntimeRoute\s*=\s*createRouteMatcher/);
  assert.match(proxy, /["']\/api\/account\(\.\*\)["']/);
  assert.match(proxy, /["']\/api\/desktop\/account\(\.\*\)["']/);
  assert.match(proxy, /["']\/api\/desktop\/transcribe\(\.\*\)["']/);
  assert.match(proxy, /await\s+auth\.protect\(\)/);
  assert.match(proxy, /!\s*shouldRunClerkProxy\(request\)/);
  assert.match(proxy, /isClerkApiRuntimeRoute\(request\)\s*&&\s*hasClerkSessionCookie\(request\)/);
  assert.match(proxy, /headers\.get\(["']cookie["']\)/);
  assert.match(proxy, /return\s+clerkProtectedProxy\(request,\s*event\)/);
  assert.match(proxy, /["']\/\(api\|trpc\)\(\.\*\)["']/);
  assert.doesNotMatch(proxy, /\/api\/status.*protect/s);
});

test("protected page surfaces require Clerk auth from server code", async () => {
  const accountPage = await readFile(accountPagePath, "utf8");
  const adminPage = await readFile(adminPagePath, "utf8");
  const adminBoundary = await readFile(
    path.join("src", "lib", "admin", "auth.ts"),
    "utf8",
  );

  assert.match(accountPage, /requireClerkUserIdForPage/);
  assert.match(accountPage, /await\s+requireClerkUserIdForPage\(\)/);
  assert.match(adminPage, /requireRubyWhisperAdminForPage/);
  assert.match(adminPage, /await\s+requireRubyWhisperAdminForPage\(\)/);
  assert.match(adminBoundary, /requireClerkUserIdForPage/);
  assert.match(adminBoundary, /lookupRubyWhisperAdminRole/);
  assert.match(adminBoundary, /^import\s+["']server-only["'];/m);

  for (const source of [accountPage, adminPage, adminBoundary]) {
    assert.doesNotMatch(source, /^["']use client["'];/);
    assert.doesNotMatch(source, /\buseAuth\b|\bSignedIn\b|\bSignedOut\b/);
  }
});

test("server auth helper returns structured unauthenticated JSON for API routes", async () => {
  const helper = await readFile(path.join("src", "lib", "auth", "clerk.ts"), "utf8");
  const route = await readFile(
    path.join("src", "app", "api", "account", "session", "route.ts"),
    "utf8",
  );

  assert.match(helper, /import\s+["']server-only["']/);
  assert.match(helper, /from\s+["']@clerk\/nextjs\/server["']/);
  assert.match(helper, /serverEnv\.client\.clerkPublishableKey/);
  assert.match(helper, /if\s*\(\s*!isClerkConfigured\s*\)/);
  assert.match(helper, /try\s*\{/);
  assert.match(helper, /\(\{\s*userId\s*\}\s*=\s*await\s+auth\(\)\)/);
  assert.match(helper, /catch\s*\{/);
  assert.match(helper, /code:\s*["']clerk_session_required["']/);
  assert.match(helper, /status:\s*401/);
  assert.match(helper, /NextResponse\.json/);
  assert.match(helper, /Cache-Control["']:\s*["']no-store/);

  assert.match(route, /requireClerkUserId\(\)/);
  assert.match(route, /clerkUnauthenticatedJsonResponse\(\)/);
  assert.match(route, /ok:\s*true/);
});

test("public marketing and status routes remain outside protected decisions", async () => {
  const [publicPage, pricingPage, statusRoute, proxy] = await Promise.all([
    readFile(path.join("src", "app", "(public)", "page.tsx"), "utf8"),
    readFile(path.join("src", "app", "(public)", "pricing", "page.tsx"), "utf8"),
    readFile(path.join("src", "app", "api", "status", "route.ts"), "utf8"),
    readFile(path.join("src", "proxy.ts"), "utf8"),
  ]);

  assert.match(publicPage, /href:\s*["']\/api\/status["']/);
  assert.match(publicPage, /href:\s*["']\/pricing["']/);
  assert.doesNotMatch(publicPage, /requireClerkUserId|auth\(|useAuth/);
  assert.doesNotMatch(pricingPage, /requireClerkUserId|auth\(|useAuth/);
  assert.doesNotMatch(statusRoute, /requireClerkUserId|auth\(|useAuth/);
  assert.doesNotMatch(proxy, /createRouteMatcher\(\[[^\]]*\/api\/status/s);
});
