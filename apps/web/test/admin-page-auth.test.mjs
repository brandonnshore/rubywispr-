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

  assert.match(markup, /Admin operations/);
  assert.match(markup, /Server-side admin authorization is active/);
  assert.match(markup, /User and account metadata/);
  assert.match(markup, /Plan and subscription status/);
  assert.match(markup, /Request and error counts/);
  assert.match(markup, /Friend of Ruby batches/);
  assert.doesNotMatch(markup, /Tables pending/);
  assert.doesNotMatch(markup, /Admin access denied/);
  assert.match(source, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(source, /requireRubyWhisperAdminForPage/);
  assert.match(source, /readRubyWhisperAdminDashboardSnapshot/);
  assert.doesNotMatch(source, /\buseAuth\b|\buseUser\b|\bSignedIn\b|\bSignedOut\b|\bProtect\b/);
});

test("admin page renders mocked source metadata without private content fields", async () => {
  const privateContentPattern =
    /raw transcript|cleaned text|clipboard|dictionary|request body|response body|authorization token|provider payload|private backend detail/i;
  const pageModule = await loadAdminPageModule({
    readDashboardSnapshot: async () => createMockDashboardSnapshot(),
    requireAdminForPage: async () =>
      createAllowedAdminResult("user_rw_synthetic_admin_001"),
  });

  const markup = renderToStaticMarkup(await pageModule.default());

  assert.match(markup, /admin@example\.test/);
  assert.match(markup, /Monthly/);
  assert.match(markup, /2,500/);
  assert.match(markup, /Mock Provider/);
  assert.match(markup, /rate_limited/);
  assert.match(markup, /FRIENDS-2026/);
  assert.doesNotMatch(markup, /req_rw_private_001|stripePromotionCodeId|promo_/i);
  assert.doesNotMatch(markup, privateContentPattern);
});

test("admin page denies signed-in non-admins without rendering admin content", async () => {
  const dashboardCalls = [];
  const pageModule = await loadAdminPageModule({
    readDashboardSnapshot: async () => {
      dashboardCalls.push({ operation: "dashboard.read" });
      return createMockDashboardSnapshot();
    },
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
  assert.doesNotMatch(markup, /Admin operations/);
  assert.doesNotMatch(markup, /Server-side admin authorization is active/);
  assert.doesNotMatch(markup, /User and account metadata/);
  assert.doesNotMatch(markup, /admin@example\.test/);
  assert.deepEqual(dashboardCalls, []);
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
  assert.doesNotMatch(markup, /Admin operations/);
  assert.doesNotMatch(markup, /Server-side admin authorization is active/);
  assert.doesNotMatch(markup, /User and account metadata/);
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

async function loadAdminPageModule({
  readDashboardSnapshot = async () => createMockDashboardSnapshot(),
  requireAdminForPage,
}) {
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
      require: createAdminPageRequire({
        readDashboardSnapshot,
        requireAdminForPage,
      }),
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

function createAdminPageRequire({
  readDashboardSnapshot,
  requireAdminForPage,
}) {
  return function requireAdminPageModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: ({ href, children, ...props }) =>
            requireCommonJs("react").createElement(
              "a",
              { ...props, href },
              children,
            ),
        };
      case "@/lib/admin/auth":
        return {
          requireRubyWhisperAdminForPage: requireAdminForPage,
        };
      case "@/lib/admin/dashboard":
        return {
          readRubyWhisperAdminDashboardSnapshot: readDashboardSnapshot,
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

function createMockDashboardSnapshot() {
  return {
    action: "loaded",
    ok: true,
    snapshot: {
      friendOfRubyBatches: {
        ok: true,
        rows: [
          {
            code: "FRIENDS-2026",
            created_at: "2026-05-04T00:00:00.000Z",
            created_by_clerk_user_id: "user_rw_synthetic_admin_001",
            expires_at: "2027-05-04T00:00:00.000Z",
            max_redemptions: 10,
          },
        ],
        status: "loaded",
      },
      generatedAt: "2026-05-04T12:00:00.000Z",
      profiles: {
        ok: true,
        rows: [
          {
            clerk_user_id: "user_rw_synthetic_admin_001",
            created_at: "2026-05-04T00:00:00.000Z",
            email: "admin@example.test",
            is_blocked: false,
            terms_accepted_at: "2026-05-04T00:00:00.000Z",
          },
        ],
        status: "loaded",
      },
      rateLimits: {
        ok: true,
        rows: [
          {
            clerk_user_id: "user_rw_synthetic_admin_001",
            request_count: 2,
            updated_at: "2026-05-04T00:05:00.000Z",
            window_start: "2026-05-04T00:00:00.000Z",
          },
        ],
        status: "loaded",
      },
      stripeWebhookEvents: {
        ok: true,
        rows: [
          {
            created_at: "2026-05-04T00:00:00.000Z",
            error_code: null,
            event_type: "customer.subscription.updated",
            failed_at: null,
            processed_at: "2026-05-04T00:00:01.000Z",
            status: "processed",
            stripe_created_at: "2026-05-04T00:00:00.000Z",
            updated_at: "2026-05-04T00:00:01.000Z",
          },
        ],
        status: "loaded",
      },
      subscriptions: {
        ok: true,
        rows: [
          {
            clerk_user_id: "user_rw_synthetic_admin_001",
            current_period_end: "2026-06-04T00:00:00.000Z",
            friend_of_ruby_until: null,
            plan: "monthly",
            status: "active",
            updated_at: "2026-05-04T00:00:00.000Z",
          },
        ],
        status: "loaded",
      },
      transcriptionRequests: {
        ok: true,
        rows: [
          {
            app_version: "0.1.0",
            audio_duration_ms: 1200,
            cleaned_word_count: 2500,
            clerk_user_id: "user_rw_synthetic_admin_001",
            created_at: "2026-05-04T00:00:00.000Z",
            error_code: "rate_limited",
            latency_ms: 250,
            os_version: "macOS 15.0",
            plan_state: "paid_active",
            provider: "mock_provider",
            status: "failure",
          },
        ],
        status: "loaded",
      },
      usageCounters: {
        ok: true,
        rows: [
          {
            clerk_user_id: "user_rw_synthetic_admin_001",
            lifetime_words_used: 10000,
            monthly_period_start: "2026-05-01",
            monthly_words_used: 2500,
            trial_words_used: 500,
            updated_at: "2026-05-04T00:00:00.000Z",
          },
        ],
        status: "loaded",
      },
    },
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
