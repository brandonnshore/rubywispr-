import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const adminFriendOfRubyBatchRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "admin",
  "friend-of-ruby",
  "batches",
  "route.ts",
);
const forbiddenPrivateAdminBatchPattern =
  /private backend detail|rawTranscript|transcript|audio|payment_method|card|invoice|sk_test|secret|user_rw_synthetic_member_001/i;

test("admin Friend of Ruby batch route creates sanitized metadata for active admins", async () => {
  const routeModule = await loadAdminFriendOfRubyBatchRouteModule();
  const calls = [];
  const handler = routeModule.createAdminFriendOfRubyBatchRouteHandler(
    createRouteDependencies({
      calls,
      now: "2026-05-04T00:00:00.000Z",
    }),
  );

  const response = await handler(
    createJsonRequest({
      codeLabel: " friends-2026 ",
      expiresAt: "2027-05-04T00:00:00.000Z",
      ignoredPrivateField: "private backend detail",
      maxRedemptions: 10,
    }),
  );
  const body = await response.json();
  const serializedBody = JSON.stringify(body);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    batch: {
      id: "11111111-1111-4111-8111-111111111111",
      codeLabel: "FRIENDS-2026",
      maxRedemptions: 10,
      expiresAt: "2027-05-04T00:00:00.000Z",
      stripePromotionCodeId: "promo_rw_synthetic_friend_001",
    },
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      operation: "admin.guard",
      route: "/api/admin/friend-of-ruby/batches",
    },
    {
      batch: {
        code: " friends-2026 ",
        expiresAt: "2027-05-04T00:00:00.000Z",
        maxRedemptions: 10,
      },
      now: "2026-05-04T00:00:00.000Z",
      operation: "stripe.preflight",
    },
    { operation: "stripe.context" },
    {
      batch: {
        code: " friends-2026 ",
        expiresAt: "2027-05-04T00:00:00.000Z",
        maxRedemptions: 10,
      },
      now: "2026-05-04T00:00:00.000Z",
      operation: "stripe.promotionCode.create",
    },
    {
      input: {
        code: " friends-2026 ",
        createdByClerkUserId: "user_rw_synthetic_admin_001",
        expiresAt: "2027-05-04T00:00:00.000Z",
        maxRedemptions: 10,
        stripePromotionCodeId: "promo_rw_synthetic_friend_001",
      },
      operation: "supabase.batch.create",
    },
  ]);
  assert.doesNotMatch(serializedBody, forbiddenPrivateAdminBatchPattern);
  assert.doesNotMatch(
    serializedBody,
    /createdByClerkUserId|createdAt|couponId|"promotionCode"/i,
  );
  assert.ok(Buffer.byteLength(serializedBody, "utf8") <= 256);
});

test("admin Friend of Ruby batch route denies missing admin roles before Stripe or Supabase work", async () => {
  const routeModule = await loadAdminFriendOfRubyBatchRouteModule();
  const calls = [];
  const handler = routeModule.createAdminFriendOfRubyBatchRouteHandler(
    createRouteDependencies({
      calls,
      guardResult: createDeniedAdminGuardResult("missing_role"),
    }),
  );

  const response = await handler(
    createJsonRequest({
      codeLabel: "FRIENDS-2026",
      maxRedemptions: 10,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, createAdminForbiddenBody());
  assert.deepEqual(toPlainObject(calls), [
    {
      operation: "admin.guard",
      route: "/api/admin/friend-of-ruby/batches",
    },
  ]);
});

test("admin Friend of Ruby batch route denies inactive and revoked admin roles before work", async () => {
  const routeModule = await loadAdminFriendOfRubyBatchRouteModule();

  for (const status of ["inactive_role", "revoked_role"]) {
    const calls = [];
    const handler = routeModule.createAdminFriendOfRubyBatchRouteHandler(
      createRouteDependencies({
        calls,
        guardResult: createDeniedAdminGuardResult(status),
      }),
    );

    const response = await handler(
      createJsonRequest({
        codeLabel: "FRIENDS-2026",
        maxRedemptions: 10,
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), createAdminForbiddenBody());
    assert.deepEqual(toPlainObject(calls), [
      {
        operation: "admin.guard",
        route: "/api/admin/friend-of-ruby/batches",
      },
    ]);
  }
});

test("admin Friend of Ruby batch route rejects invalid input without client-backed Stripe or Supabase work", async () => {
  const routeModule = await loadAdminFriendOfRubyBatchRouteModule();
  const calls = [];
  const handler = routeModule.createAdminFriendOfRubyBatchRouteHandler(
    createRouteDependencies({
      calls,
      stripePreflightResult: {
        error: {
          code: "invalid_friend_of_ruby_batch_code",
          message: "Friend of Ruby Stripe promotion code metadata is not valid.",
        },
        ok: false,
        status: "invalid_code",
      },
    }),
  );

  const response = await handler(
    createJsonRequest({
      codeLabel: "https://example.invalid/private-value",
      maxRedemptions: 10,
    }),
  );
  const body = await response.json();
  const serializedBody = JSON.stringify(body);

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "admin_friend_of_ruby_batch_invalid",
      message: "Friend of Ruby batch input is not valid.",
    },
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      operation: "admin.guard",
      route: "/api/admin/friend-of-ruby/batches",
    },
    {
      batch: {
        code: "https://example.invalid/private-value",
        maxRedemptions: 10,
      },
      operation: "stripe.preflight",
    },
  ]);
  assert.doesNotMatch(serializedBody, /example\.invalid|private-value/i);
});

test("admin Friend of Ruby batch route does not persist a completed batch when Stripe fails", async () => {
  const routeModule = await loadAdminFriendOfRubyBatchRouteModule();
  const calls = [];
  const handler = routeModule.createAdminFriendOfRubyBatchRouteHandler(
    createRouteDependencies({
      calls,
      stripeResult: {
        error: {
          code: "stripe_friend_of_ruby_promotion_code_create_failed",
          message: "Unable to create Friend of Ruby Stripe promotion code.",
        },
        ok: false,
        status: "promotion_code_create_failed",
      },
    }),
  );

  const response = await handler(
    createJsonRequest({
      codeLabel: "FRIENDS-2026",
      maxRedemptions: 10,
    }),
  );
  const body = await response.json();
  const serializedBody = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "admin_friend_of_ruby_stripe_failed",
      message: "Unable to create Friend of Ruby promotion code.",
    },
  });
  assert.deepEqual(
    calls.map((call) => call.operation),
    [
      "admin.guard",
      "stripe.preflight",
      "stripe.context",
      "stripe.promotionCode.create",
    ],
  );
  assert.doesNotMatch(serializedBody, /FRIENDS-2026|private backend detail/i);
});

test("admin Friend of Ruby batch route sanitizes Supabase failures", async () => {
  const routeModule = await loadAdminFriendOfRubyBatchRouteModule();
  const calls = [];
  const handler = routeModule.createAdminFriendOfRubyBatchRouteHandler(
    createRouteDependencies({
      calls,
      metadataResult: {
        error: {
          code: "supabase_friend_of_ruby_batch_create_failed",
          message: "Unable to create Friend of Ruby batch metadata.",
        },
        ok: false,
        status: "create_failed",
      },
    }),
  );

  const response = await handler(
    createJsonRequest({
      codeLabel: "PRIVATE-FRIENDS-2026",
      maxRedemptions: 10,
    }),
  );
  const body = await response.json();
  const serializedBody = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "admin_friend_of_ruby_batch_create_failed",
      message: "Unable to create Friend of Ruby batch metadata.",
    },
  });
  assert.deepEqual(
    calls.map((call) => call.operation),
    [
      "admin.guard",
      "stripe.preflight",
      "stripe.context",
      "stripe.promotionCode.create",
      "supabase.batch.create",
    ],
  );
  assert.doesNotMatch(serializedBody, /PRIVATE-FRIENDS-2026|user_rw_synthetic_admin_001/i);
});

test("admin Friend of Ruby batch route remains server-only and metadata-only", async () => {
  const source = await readFile(adminFriendOfRubyBatchRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /requireRubyWhisperAdminForApi/);
  assert.match(source, /createFriendOfRubyBatchMetadata/);
  assert.match(source, /createFriendOfRubyStripePromotionCode/);
  assert.match(source, /createStripeBillingContext/);
  assert.match(source, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(source, /export\s+const\s+runtime\s*=\s*["']nodejs["']/);
  assert.doesNotMatch(source, /^["']use client["'];/m);
  assert.doesNotMatch(source, /\buseAuth\b|\buseUser\b|\bSignedIn\b|\bSignedOut\b|\bProtect\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const privateFragment of [
    "audio",
    "rawTranscript",
    "transcript",
    "cleanedText",
    "clipboard",
    "prompt",
    "payment_method",
    "card",
    "invoice",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${privateFragment}\\b`),
      `admin Friend of Ruby route must not reference private/payment field "${privateFragment}"`,
    );
  }
});

async function loadAdminFriendOfRubyBatchRouteModule() {
  const source = await readFile(adminFriendOfRubyBatchRoutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: adminFriendOfRubyBatchRoutePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createRouteModuleRequire(),
    },
    {
      filename: adminFriendOfRubyBatchRoutePath,
    },
  );

  return commonJsModule.exports;
}

function createRouteModuleRequire() {
  return function requireRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return { createClient: () => ({}) };
      case "@/lib/admin/api":
        return {
          requireRubyWhisperAdminForApi: async () =>
            createAllowedAdminGuardResult(),
        };
      case "@/lib/billing/stripe":
        return {
          createStripeBillingContext: () => ({
            context: {
              apiVersion: "2026-04-22.dahlia",
              client: {},
              priceIds: {
                annual: "price_rw_annual",
                monthly: "price_rw_monthly",
              },
            },
            ok: true,
          }),
        };
      case "@/lib/friend-of-ruby/batches":
        return {
          createFriendOfRubyBatchMetadata: async () =>
            createCreatedBatchMetadataResult(),
        };
      case "@/lib/friend-of-ruby/stripe":
        return {
          createFriendOfRubyStripeCreationRequest: () => ({ ok: true }),
          createFriendOfRubyStripePromotionCode: async () =>
            createStripeCreatedResult(),
        };
      default:
        throw new Error(`Unexpected admin Friend of Ruby dependency ${specifier}`);
    }
  };
}

function createRouteDependencies({
  calls,
  guardResult = createAllowedAdminGuardResult(),
  metadataResult = createCreatedBatchMetadataResult(),
  now = undefined,
  stripePreflightResult = { ok: true },
  stripeResult = createStripeCreatedResult(),
}) {
  return {
    createBatchClient: () => ({}),
    createBatchMetadata: async (input) => {
      calls.push({ input, operation: "supabase.batch.create" });

      return metadataResult;
    },
    createStripeContext: () => {
      calls.push({ operation: "stripe.context" });

      return {
        context: {
          apiVersion: "2026-04-22.dahlia",
          client: {},
          priceIds: {
            annual: "price_rw_annual",
            monthly: "price_rw_monthly",
          },
        },
        ok: true,
      };
    },
    createStripeCreationRequest: (batch, currentNow) => {
      calls.push({
        batch,
        now: currentNow,
        operation: "stripe.preflight",
      });

      return stripePreflightResult;
    },
    createStripePromotionCode: async (input) => {
      calls.push({
        batch: input.batch,
        now: input.now,
        operation: "stripe.promotionCode.create",
      });

      return stripeResult;
    },
    now,
    requireAdmin: async (input) => {
      calls.push({
        operation: "admin.guard",
        route: input.route,
      });

      return guardResult;
    },
  };
}

function createJsonRequest(body) {
  return new Request("https://rubywhisper-backend.test/api/admin/friend-of-ruby/batches", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function createAllowedAdminGuardResult() {
  return {
    action: "allowed",
    authorization: {
      action: "allowed",
      allowed: true,
      clerkUserId: "user_rw_synthetic_admin_001",
      ok: true,
      role: "admin",
      status: "active_admin",
    },
    ok: true,
  };
}

function createDeniedAdminGuardResult(status) {
  return {
    action: "denied",
    authorization: {
      action: "denied",
      allowed: false,
      clerkUserId: "user_rw_synthetic_member_001",
      error: {
        code: `supabase_admin_role_${status}`,
        message: "No active admin role metadata was found.",
      },
      ok: false,
      status,
    },
    ok: false,
    response: Response.json(createAdminForbiddenBody(), {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 403,
    }),
    status: "forbidden",
  };
}

function createAdminForbiddenBody() {
  return {
    ok: false,
    error: {
      code: "admin_forbidden",
      desktopState: "blocked",
      message: "This account is not a RubyWhisper admin.",
      recovery: "open_account",
      retryable: false,
    },
  };
}

function createStripeCreatedResult() {
  return {
    action: "created",
    couponId: "coupon_rw_synthetic_friend_001",
    ok: true,
    promotionCode: "FRIENDS-2026",
    status: "created",
    stripePromotionCodeId: "promo_rw_synthetic_friend_001",
  };
}

function createCreatedBatchMetadataResult() {
  return {
    action: "created",
    batch: {
      code: "FRIENDS-2026",
      createdAt: "2026-05-04T00:00:00.000Z",
      createdByClerkUserId: "user_rw_synthetic_admin_001",
      expiresAt: "2027-05-04T00:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 10,
      stripePromotionCodeId: "promo_rw_synthetic_friend_001",
    },
    ok: true,
    status: "created",
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
