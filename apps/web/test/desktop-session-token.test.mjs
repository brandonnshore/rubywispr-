import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import * as ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const desktopSessionPath = path.join(
  "src",
  "lib",
  "auth",
  "desktop-session.ts",
);

test("desktop session tokens verify RubyWhisper-issued desktop auth", async () => {
  const sessionModule = await loadDesktopSessionModule({
    secret: "desktop_session_secret_placeholder",
  });
  const issued = sessionModule.createRubyWhisperDesktopSessionToken({
    accountId: "user_3DNKd6QGk0h51KCmkgUHKcRElGy",
    nowMs: () => 1_800_000_000_000,
    secret: "desktop_session_secret_placeholder",
    ttlSeconds: 60,
  });

  assert.equal(issued.ok, true);
  assert.equal(issued.accountId, "user_3DNKd6QGk0h51KCmkgUHKcRElGy");
  assert.equal(issued.expiresAt, "2027-01-15T08:01:00.000Z");
  assert.match(issued.token, /^rwds1\./);

  const verified = sessionModule.verifyRubyWhisperDesktopSessionToken(issued.token, {
    nowMs: () => 1_800_000_030_000,
    secret: "desktop_session_secret_placeholder",
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.accountId, "user_3DNKd6QGk0h51KCmkgUHKcRElGy");
  assert.equal(verified.expiresAt, "2027-01-15T08:01:00.000Z");
});

test("desktop session auth accepts bearer tokens and rejects expired tokens", async () => {
  const sessionModule = await loadDesktopSessionModule({
    secret: "desktop_session_secret_placeholder",
  });
  const issued = sessionModule.createRubyWhisperDesktopSessionToken({
    accountId: "user_rw_desktop_member_001",
    nowMs: () => 1_800_000_000_000,
    secret: "desktop_session_secret_placeholder",
    ttlSeconds: 30,
  });

  assert.equal(issued.ok, true);

  const accepted = await sessionModule.requireRubyWhisperDesktopUserId(
    new Request("https://rubywhisper.test/api/desktop/account", {
      headers: {
        Authorization: `Bearer ${issued.token}`,
      },
    }),
  );

  assert.equal(accepted.ok, true);
  assert.equal(accepted.userId, "user_rw_desktop_member_001");

  const expired = sessionModule.verifyRubyWhisperDesktopSessionToken(issued.token, {
    nowMs: () => 1_800_000_031_000,
    secret: "desktop_session_secret_placeholder",
  });

  assert.equal(expired.ok, false);
  assert.equal(expired.reason, "expired");
});

test("desktop session auth falls back to Clerk cookie auth when no bearer is present", async () => {
  const sessionModule = await loadDesktopSessionModule({
    clerkAuth: async () => ({ ok: true, userId: "user_cookie_member_001" }),
    secret: "desktop_session_secret_placeholder",
  });
  const result = await sessionModule.requireRubyWhisperDesktopUserId(
    new Request("https://rubywhisper.test/api/desktop/account"),
  );

  assert.deepEqual(result, {
    ok: true,
    userId: "user_cookie_member_001",
  });
});

async function loadDesktopSessionModule({
  clerkAuth = async () => ({
    error: {
      code: "clerk_session_required",
      message: "A Clerk user session is required.",
    },
    ok: false,
  }),
  secret,
} = {}) {
  const source = await readFile(desktopSessionPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n\n/, "");
  const compiled = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: desktopSessionPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Buffer,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: (specifier) => {
        switch (specifier) {
          case "node:crypto":
            return require("node:crypto");
          case "@/config/server":
            return {
              serverEnv: {
                clerk: { secretKey: undefined },
                desktop: { sessionSecret: secret },
              },
            };
          case "@/lib/auth/clerk":
            return {
              clerkUnauthenticatedError: {
                code: "clerk_session_required",
                message: "A Clerk user session is required.",
              },
              requireClerkUserId: clerkAuth,
            };
          default:
            throw new Error(`Unexpected desktop session import: ${specifier}`);
        }
      },
      Request,
    },
    {
      filename: desktopSessionPath,
    },
  );

  return commonJsModule.exports;
}
