import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const authRoot = path.join("src", "app", "(auth)");
const signInRoute = path.join(
  authRoot,
  "sign-in",
  "[[...sign-in]]",
  "page.tsx",
);
const signUpRoute = path.join(
  authRoot,
  "sign-up",
  "[[...sign-up]]",
  "page.tsx",
);
const authShellRoute = path.join(authRoot, "_components", "auth-route-shell.tsx");

test("Clerk email auth route shell uses App Router catch-all pages", async () => {
  const [signInPage, signUpPage, publicPage] = await Promise.all([
    readFile(signInRoute, "utf8"),
    readFile(signUpRoute, "utf8"),
    readFile(path.join("src", "app", "(public)", "page.tsx"), "utf8"),
  ]);

  assert.match(
    signInPage,
    /<AuthRouteShell mode="sign-in" forceRedirectUrl=\{forceRedirectUrl\} \/>/,
  );
  assert.match(
    signUpPage,
    /<AuthRouteShell mode="sign-up" forceRedirectUrl=\{forceRedirectUrl\} \/>/,
  );
  assert.match(publicPage, /href: "\/sign-in"/);
  assert.match(publicPage, /href: "\/sign-up"/);
  assert.match(publicPage, /href: "\/pricing"/);
});

test("launch auth copy stays email-only", async () => {
  const source = await readFile(authShellRoute, "utf8");
  const unsupportedLaunchMethods = [
    /\bGoogle\b/i,
    /\bApple\b/i,
    /\bpassword\b/i,
    /\bSSO\b/i,
    /\bsocial\b/i,
  ];

  assert.match(source, /Email sign-in/);
  assert.match(source, /Email sign-up/);
  assert.match(source, /secure link/);

  for (const methodPattern of unsupportedLaunchMethods) {
    assert.doesNotMatch(source, methodPattern);
  }
});

test("auth route shell gates Clerk components behind blank-env safe public config", async () => {
  const source = await readFile(authShellRoute, "utf8");

  assert.match(source, /from\s+["']@clerk\/react["']/);
  assert.match(source, /clientEnv\.clerkPublishableKey/);
  assert.match(source, /<ClerkProvider/);
  assert.match(source, /<SignIn/);
  assert.match(source, /<SignUp/);
  assert.match(source, /data-clerk-configured/);
});

test("auth route shell keeps Clerk card legible on the dark RubyWhisper surface", async () => {
  const [source, globalStyles] = await Promise.all([
    readFile(authShellRoute, "utf8"),
    readFile(path.join("src", "app", "globals.css"), "utf8"),
  ]);

  assert.match(source, /colorBackground:\s*["']#ffffff["']/);
  assert.match(source, /colorText:\s*["']#17171b["']/);
  assert.match(source, /colorInputBackground:\s*["']#ffffff["']/);
  assert.match(source, /colorInputText:\s*["']#17171b["']/);
  assert.match(globalStyles, /\.auth-panel h1\s*\{/);
  assert.match(globalStyles, /\.auth-card\s*\{[\s\S]*width:\s*min\(100%, 420px\);/);
  assert.match(globalStyles, /\.clerk-card\s*\{[\s\S]*background:\s*#ffffff;/);
  assert.match(globalStyles, /\.clerk-card\s*\{[\s\S]*color:\s*#17171b;/);
});

test("auth source avoids logging or fixture storage of auth link and session material", async () => {
  const violations = [];

  for (const filePath of await listFiles("src")) {
    const relativePath = normalizePath(filePath);

    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(relativePath)) {
      continue;
    }

    const source = await readFile(filePath, "utf8");

    if (/\bconsole\.(?:log|debug|info|warn|error)\b/.test(source)) {
      violations.push(`${relativePath} contains console output`);
    }

    if (/(?:ticket|session|auth|magic)[_-]?(?:token|url|link)\s*[:=]\s*["'][^"']+["']/i.test(source)) {
      violations.push(`${relativePath} stores auth link or token-like material`);
    }
  }

  assert.deepEqual(violations, []);
});

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }

      if (entry.isFile()) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat();
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
