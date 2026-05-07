import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const callbackRoutePath = path.join(
  "src",
  "app",
  "api",
  "desktop",
  "login",
  "callback",
  "route.ts",
);
const exchangeRoutePath = path.join(
  "src",
  "app",
  "api",
  "desktop",
  "login",
  "exchange",
  "route.ts",
);
const exchangeStorePath = path.join(
  "src",
  "lib",
  "desktop-login",
  "exchange-store.ts",
);

test("desktop login callback turns Clerk sessions into app callback handoffs", async () => {
  const source = await readFile(callbackRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /auth\(\)/);
  assert.match(source, /\.getToken\(\)/);
  assert.match(source, /createDesktopLoginExchangeCode/);
  assert.match(source, /callbackScheme.*:\/\/auth\/callback/s);
  assert.match(source, /nonce_challenge/);
  assert.match(source, /callback_scheme/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bCLERK_SECRET_KEY\b|\bSUPABASE_SECRET_KEY\b/);
});

test("desktop login exchange consumes one-time codes without logging session material", async () => {
  const source = await readFile(exchangeRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /consumeDesktopLoginExchangeCode/);
  assert.match(source, /nonce_verifier/);
  assert.match(source, /accessToken/);
  assert.match(source, /Cache-Control/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bCLERK_SECRET_KEY\b|\bSUPABASE_SECRET_KEY\b/);
});

test("desktop login exchange store gates codes with state and PKCE", async () => {
  const source = await readFile(exchangeStorePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /exchangeCodes\.delete\(code\)/);
  assert.match(source, /expiresAtMs/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bprocess\.env\b/);
});
