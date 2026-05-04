import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const requireCommonJs = createRequire(import.meta.url);
const webRoot = path.join(repoRoot, "apps", "web");
const adminAuthPath = path.join(webRoot, "src", "lib", "admin", "auth.ts");
const adminPagePath = path.join(webRoot, "src", "app", "admin", "page.tsx");

test("admin page boundary allows signed-in active admins", async () => {
  const boundary = await loadAdminAuthModule();
  const calls = [];

  const result = await boundary.requireRubyWhisperAdminForPage({
    createClient: () => {
      calls.push({ operation: "createClient" });
      return {};
    },
    lookupAdminRole: async (input) => {
      calls.push({ clerkUserId: input.clerkUserId, operation: "lookup" });

      return createAllowedAdminResult(input.clerkUserId);
    },
    requireUserIdForPage: async () => "user_rw_synthetic_admin_001",
  });

  assert.deepEqual(toPlainObject(result), {
    action: "allowed",
    allowed: true,
    clerkUserId: "user_rw_synthetic_admin_001",
    ok: true,
    role: "admin",
    status: "active_admin",
  });
  assert.deepEqual(calls, [
    {
      clerkUserId: "user_rw_synthetic_admin_001",
      operation: "lookup",
    },
  ]);
});

test("admin page boundary redirects signed-out requests through the Clerk page guard", async () => {
  const boundary = await loadAdminAuthModule();
  const calls = [];

  await assertRejectsRedirect(
    boundary.requireRubyWhisperAdminForPage({
      lookupAdminRole: async () => {
        calls.push({ operation: "lookup" });
        throw new Error("lookup should not run for signed-out requests");
      },
      requireUserIdForPage: async () => {
        throw Object.assign(new Error("NEXT_REDIRECT"), { url: "/sign-in" });
      },
    }),
    "/sign-in",
  );
  assert.deepEqual(calls, []);
});

test("admin page boundary denies signed-in non-admins", async () => {
  const boundary = await loadAdminAuthModule();

  const result = await boundary.requireRubyWhisperAdminForPage({
    lookupAdminRole: async (input) => ({
      action: "denied",
      allowed: false,
      clerkUserId: input.clerkUserId,
      error: {
        code: "supabase_admin_role_missing",
        message: "No active admin role metadata was found.",
      },
      ok: false,
      status: "missing_role",
    }),
    requireUserIdForPage: async () => "user_rw_synthetic_member_001",
  });

  assert.deepEqual(toPlainObject(result), {
    action: "denied",
    allowed: false,
    clerkUserId: "user_rw_synthetic_member_001",
    error: {
      code: "supabase_admin_role_missing",
      message: "No active admin role metadata was found.",
    },
    ok: false,
    status: "missing_role",
  });
});

test("admin page boundary fails closed when role lookup throws", async () => {
  const boundary = await loadAdminAuthModule();

  const result = await boundary.requireRubyWhisperAdminForPage({
    lookupAdminRole: async () => {
      throw new Error("private backend detail");
    },
    requireUserIdForPage: async () => "user_rw_synthetic_admin_001",
  });

  assert.deepEqual(toPlainObject(result), {
    action: "denied",
    allowed: false,
    clerkUserId: "user_rw_synthetic_admin_001",
    error: {
      code: "supabase_admin_role_read_failed",
      message: "Unable to read admin role metadata.",
    },
    ok: false,
    status: "read_failed",
  });
  assert.doesNotMatch(JSON.stringify(result), /private backend detail/i);
});

test("admin page renders admin content only for active admins", async () => {
  const pageModule = await loadAdminPageModule({
    requireAdminForPage: async () =>
      createAllowedAdminResult("user_rw_synthetic_admin_001"),
  });

  const markup = renderToStaticMarkup(await pageModule.default());
  const source = await readFile(adminPagePath, "utf8");

  assert.match(markup, /Admin route placeholder/);
  assert.match(markup, /server-side admin workflows/);
  assert.doesNotMatch(markup, /Admin access denied/);
  assert.match(source, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(source, /requireRubyWhisperAdminForPage/);
  assert.doesNotMatch(source, /\buseAuth\b|\buseUser\b|\bSignedIn\b|\bSignedOut\b|\bProtect\b/);
});

test("admin page denies signed-in non-admins without rendering admin content", async () => {
  const pageModule = await loadAdminPageModule({
    requireAdminForPage: async () => ({
      action: "denied",
      allowed: false,
      clerkUserId: "user_rw_synthetic_member_001",
      error: {
        code: "supabase_admin_role_missing",
        message: "No active admin role metadata was found.",
      },
      ok: false,
      status: "missing_role",
    }),
  });

  const markup = renderToStaticMarkup(await pageModule.default());

  assert.match(markup, /Admin access denied/);
  assert.match(markup, /does not have an active RubyWhisper admin role/);
  assert.doesNotMatch(markup, /Admin route placeholder/);
  assert.doesNotMatch(markup, /server-side admin workflows/);
});

test("admin page fails closed without rendering admin content on backend errors", async () => {
  const pageModule = await loadAdminPageModule({
    requireAdminForPage: async () => ({
      action: "denied",
      allowed: false,
      clerkUserId: "user_rw_synthetic_admin_001",
      error: {
        code: "supabase_admin_role_read_failed",
        message: "Unable to read admin role metadata.",
      },
      ok: false,
      status: "read_failed",
    }),
  });

  const markup = renderToStaticMarkup(await pageModule.default());

  assert.match(markup, /Admin access denied/);
  assert.doesNotMatch(markup, /Admin route placeholder/);
  assert.doesNotMatch(markup, /server-side admin workflows/);
});

test("admin page preserves the Clerk sign-in redirect for signed-out requests", async () => {
  const pageModule = await loadAdminPageModule({
    requireAdminForPage: async () => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url: "/sign-in" });
    },
  });

  await assertRejectsRedirect(pageModule.default(), "/sign-in");
});

async function loadAdminAuthModule() {
  const source = await readFile(adminAuthPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: adminAuthPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createAdminAuthRequire(),
    },
    {
      filename: adminAuthPath,
    },
  );

  return commonJsModule.exports;
}

async function loadAdminPageModule({ requireAdminForPage }) {
  const source = await readFile(adminPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: adminPagePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createAdminPageRequire(requireAdminForPage),
    },
    {
      filename: adminPagePath,
    },
  );

  return commonJsModule.exports;
}

function createAdminAuthRequire() {
  return function requireAdminAuthModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient: () => ({}),
        };
      case "@/lib/admin/roles":
        return {
          lookupRubyWhisperAdminRole: async (input) =>
            createAllowedAdminResult(input.clerkUserId),
        };
      case "@/lib/auth/clerk":
        return {
          requireClerkUserIdForPage: async () =>
            "user_rw_synthetic_admin_001",
        };
      default:
        throw new Error(`Unexpected admin auth dependency ${specifier}`);
    }
  };
}

function createAdminPageRequire(requireAdminForPage) {
  return function requireAdminPageModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "@/lib/admin/auth":
        return {
          requireRubyWhisperAdminForPage: requireAdminForPage,
        };
      default:
        throw new Error(`Unexpected admin page dependency ${specifier}`);
    }
  };
}

function createAllowedAdminResult(clerkUserId) {
  return {
    action: "allowed",
    allowed: true,
    clerkUserId,
    ok: true,
    role: "admin",
    status: "active_admin",
  };
}

async function assertRejectsRedirect(promise, expectedUrl) {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.message, "NEXT_REDIRECT");
      assert.equal(error.url, expectedUrl);

      return true;
    },
  );
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
