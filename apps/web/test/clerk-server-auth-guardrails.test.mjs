import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const protectedPages = [
  path.join("src", "app", "account", "page.tsx"),
  path.join("src", "app", "admin", "page.tsx"),
];

test("Next 16 Clerk proxy protects account and admin page routes", async () => {
  const proxy = await readFile(path.join("src", "proxy.ts"), "utf8");

  await assert.rejects(access(path.join("src", "middleware.ts")));
  assert.match(
    proxy,
    /import\s+\{\s*clerkMiddleware,\s*createRouteMatcher\s*\}\s+from\s+["']@clerk\/nextjs\/server["']/,
  );
  assert.match(proxy, /createRouteMatcher\(\[\s*["']\/account\(\.\*\)["']/);
  assert.match(proxy, /["']\/admin\(\.\*\)["']/);
  assert.match(proxy, /await\s+auth\.protect\(\)/);
  assert.match(proxy, /["']\/\(api\|trpc\)\(\.\*\)["']/);
  assert.doesNotMatch(proxy, /\/api\/status.*protect/s);
});

test("protected page surfaces require Clerk auth from server code", async () => {
  for (const pagePath of protectedPages) {
    const source = await readFile(pagePath, "utf8");

    assert.match(source, /requireClerkUserIdForPage/);
    assert.match(source, /await\s+requireClerkUserIdForPage\(\)/);
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
  assert.match(helper, /const\s+\{\s*userId\s*\}\s*=\s*await\s+auth\(\)/);
  assert.match(helper, /code:\s*["']clerk_session_required["']/);
  assert.match(helper, /status:\s*401/);
  assert.match(helper, /NextResponse\.json/);
  assert.match(helper, /Cache-Control["']:\s*["']no-store/);

  assert.match(route, /requireClerkUserId\(\)/);
  assert.match(route, /clerkUnauthenticatedJsonResponse\(\)/);
  assert.match(route, /ok:\s*true/);
});

test("public marketing and status routes remain outside protected decisions", async () => {
  const [publicPage, statusRoute, proxy] = await Promise.all([
    readFile(path.join("src", "app", "(public)", "page.tsx"), "utf8"),
    readFile(path.join("src", "app", "api", "status", "route.ts"), "utf8"),
    readFile(path.join("src", "proxy.ts"), "utf8"),
  ]);

  assert.match(publicPage, /href:\s*["']\/api\/status["']/);
  assert.doesNotMatch(publicPage, /requireClerkUserId|auth\(|useAuth/);
  assert.doesNotMatch(statusRoute, /requireClerkUserId|auth\(|useAuth/);
  assert.doesNotMatch(proxy, /createRouteMatcher\(\[[^\]]*\/api\/status/s);
});
