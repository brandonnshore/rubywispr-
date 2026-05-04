import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
const srcRoot = path.join(webRoot, "src");
const friendOfRubyStripeModulePath = path.join(
  srcRoot,
  "lib",
  "friend-of-ruby",
  "stripe.ts",
);
const sourceFileExtensions = new Set([".ts", ".tsx"]);
const validApiVersion = "2026-04-22.dahlia";
const validBatch = {
  code: " friends-2026 ",
  expiresAt: "2027-05-04T00:00:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
  maxRedemptions: 10,
};
const frozenNow = "2026-05-04T00:00:00.000Z";

test("Friend of Ruby Stripe helper builds deterministic one-year creation requests", async () => {
  const helper = await loadFriendOfRubyStripeHelper();
  const request = helper.createFriendOfRubyStripeCreationRequest(
    validBatch,
    frozenNow,
  );

  assert.deepEqual(toPlainObject(request), {
    ok: true,
    request: {
      coupon: {
        duration: "repeating",
        duration_in_months: 12,
        max_redemptions: 10,
        metadata: {
          friend_of_ruby_batch_code: "FRIENDS-2026",
          friend_of_ruby_batch_id:
            "11111111-1111-4111-8111-111111111111",
        },
        name: "Friend of Ruby FRIENDS-2026",
        percent_off: 100,
        redeem_by: 1809388800,
      },
      couponOptions: {
        idempotencyKey: "friend-of-ruby-coupon-FRIENDS-2026",
      },
      promotionCode: {
        active: true,
        code: "FRIENDS-2026",
        expires_at: 1809388800,
        max_redemptions: 10,
        metadata: {
          friend_of_ruby_batch_code: "FRIENDS-2026",
          friend_of_ruby_batch_id:
            "11111111-1111-4111-8111-111111111111",
        },
        promotion: {
          coupon: "",
          type: "coupon",
        },
      },
      promotionCodeOptions: {
        idempotencyKey: "friend-of-ruby-promotion-code-FRIENDS-2026",
      },
    },
  });
});

test("Friend of Ruby Stripe helper creates coupon then promotion code with mocked clients", async () => {
  const helper = await loadFriendOfRubyStripeHelper();
  const { calls, client } = createMockStripeClient();

  const result = await helper.createFriendOfRubyStripePromotionCode({
    batch: validBatch,
    context: {
      apiVersion: validApiVersion,
      client,
    },
    now: frozenNow,
  });

  assert.deepEqual(toPlainObject(result), {
    action: "created",
    couponId: "coupon_rw_synthetic_friend_001",
    ok: true,
    promotionCode: "FRIENDS-2026",
    status: "created",
    stripePromotionCodeId: "promo_rw_synthetic_friend_001",
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      operation: "coupon.create",
      options: {
        idempotencyKey: "friend-of-ruby-coupon-FRIENDS-2026",
      },
      params: {
        duration: "repeating",
        duration_in_months: 12,
        max_redemptions: 10,
        metadata: {
          friend_of_ruby_batch_code: "FRIENDS-2026",
          friend_of_ruby_batch_id:
            "11111111-1111-4111-8111-111111111111",
        },
        name: "Friend of Ruby FRIENDS-2026",
        percent_off: 100,
        redeem_by: 1809388800,
      },
    },
    {
      operation: "promotionCode.create",
      options: {
        idempotencyKey: "friend-of-ruby-promotion-code-FRIENDS-2026",
      },
      params: {
        active: true,
        code: "FRIENDS-2026",
        expires_at: 1809388800,
        max_redemptions: 10,
        metadata: {
          friend_of_ruby_batch_code: "FRIENDS-2026",
          friend_of_ruby_batch_id:
            "11111111-1111-4111-8111-111111111111",
        },
        promotion: {
          coupon: "coupon_rw_synthetic_friend_001",
          type: "coupon",
        },
      },
    },
  ]);
});

test("Friend of Ruby Stripe helper omits optional expiration and row id metadata", async () => {
  const helper = await loadFriendOfRubyStripeHelper();
  const request = helper.createFriendOfRubyStripeCreationRequest(
    {
      code: "FRIENDS-2026",
      maxRedemptions: 3,
    },
    frozenNow,
  );

  assert.equal(request.ok, true);
  assert.deepEqual(toPlainObject(request.request.coupon), {
    duration: "repeating",
    duration_in_months: 12,
    max_redemptions: 3,
    metadata: {
      friend_of_ruby_batch_code: "FRIENDS-2026",
    },
    name: "Friend of Ruby FRIENDS-2026",
    percent_off: 100,
  });
  assert.deepEqual(toPlainObject(request.request.promotionCode), {
    active: true,
    code: "FRIENDS-2026",
    max_redemptions: 3,
    metadata: {
      friend_of_ruby_batch_code: "FRIENDS-2026",
    },
    promotion: {
      coupon: "",
      type: "coupon",
    },
  });
});

test("Friend of Ruby Stripe helper rejects invalid constraints before Stripe calls", async () => {
  const helper = await loadFriendOfRubyStripeHelper();
  const { calls, client } = createMockStripeClient();
  const invalidInputs = [
    [
      {
        code: "https://example.invalid/private-value",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "invalid_friend_of_ruby_batch_code",
          message:
            "Friend of Ruby Stripe promotion code metadata is not valid.",
        },
        ok: false,
        status: "invalid_code",
      },
    ],
    [
      {
        code: "FRIENDS-2026",
        maxRedemptions: 0,
      },
      {
        error: {
          code: "invalid_friend_of_ruby_max_redemptions",
          message:
            "Friend of Ruby Stripe max redemptions must be a positive bounded integer.",
        },
        ok: false,
        status: "invalid_max_redemptions",
      },
    ],
    [
      {
        code: "FRIENDS-2026",
        expiresAt: "2026-05-03T00:00:00.000Z",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "invalid_friend_of_ruby_expiration",
          message:
            "Friend of Ruby Stripe expiration must be a future timestamp.",
        },
        ok: false,
        status: "invalid_expiration",
      },
    ],
    [
      {
        code: "FRIENDS-2026",
        id: "private-row-id",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "invalid_friend_of_ruby_batch_id",
          message: "Friend of Ruby Stripe batch metadata is not valid.",
        },
        ok: false,
        status: "invalid_metadata",
      },
    ],
  ];

  for (const [batch, expected] of invalidInputs) {
    const result = await helper.createFriendOfRubyStripePromotionCode({
      batch,
      context: {
        apiVersion: validApiVersion,
        client,
      },
      now: frozenNow,
    });

    assert.deepEqual(toPlainObject(result), expected);
    assert.doesNotMatch(
      JSON.stringify(result),
      /example\.invalid|private-value|private-row-id/i,
    );
  }

  assert.deepEqual(calls, []);
});

test("Friend of Ruby Stripe helper returns sanitized mocked Stripe failures", async () => {
  const helper = await loadFriendOfRubyStripeHelper();
  const couponFailure = await helper.createFriendOfRubyStripePromotionCode({
    batch: validBatch,
    context: {
      apiVersion: validApiVersion,
      client: createMockStripeClient({
        couponError:
          "Stripe failed with sk_test_private_fixture coupon_private_payload",
      }).client,
    },
    now: frozenNow,
  });
  const promotionCodeFailure =
    await helper.createFriendOfRubyStripePromotionCode({
      batch: validBatch,
      context: {
        apiVersion: validApiVersion,
        client: createMockStripeClient({
          promotionCodeError:
            "Stripe failed with promo_private_payload coupon_private_payload card",
        }).client,
      },
      now: frozenNow,
    });
  const invalidReturnedCoupon =
    await helper.createFriendOfRubyStripePromotionCode({
      batch: validBatch,
      context: {
        apiVersion: validApiVersion,
        client: createMockStripeClient({
          couponId: "coupon_private_payload",
        }).client,
      },
      now: frozenNow,
    });
  const invalidReturnedPromotionCode =
    await helper.createFriendOfRubyStripePromotionCode({
      batch: validBatch,
      context: {
        apiVersion: validApiVersion,
        client: createMockStripeClient({
          promotionCodeId: "promo_private_payload",
        }).client,
      },
      now: frozenNow,
    });

  assert.deepEqual(toPlainObject(couponFailure), {
    error: {
      code: "stripe_friend_of_ruby_coupon_create_failed",
      message: "Unable to create Friend of Ruby Stripe coupon.",
    },
    ok: false,
    status: "coupon_create_failed",
  });
  assert.deepEqual(toPlainObject(promotionCodeFailure), {
    error: {
      code: "stripe_friend_of_ruby_promotion_code_create_failed",
      message: "Unable to create Friend of Ruby Stripe promotion code.",
    },
    ok: false,
    status: "promotion_code_create_failed",
  });
  assert.equal(invalidReturnedCoupon.status, "coupon_create_failed");
  assert.equal(
    invalidReturnedPromotionCode.status,
    "promotion_code_create_failed",
  );

  for (const result of [
    couponFailure,
    promotionCodeFailure,
    invalidReturnedCoupon,
    invalidReturnedPromotionCode,
  ]) {
    assert.doesNotMatch(
      JSON.stringify(result),
      /sk_test|promo_private|coupon_private|card|payload/i,
    );
  }
});

test("Friend of Ruby Stripe helper requires no live Stripe-looking credentials", async () => {
  const helper = await loadFriendOfRubyStripeHelper();
  const { client } = createMockStripeClient();

  const result = await helper.createFriendOfRubyStripePromotionCode({
    batch: validBatch,
    context: {
      apiVersion: helper.getFriendOfRubyStripeApiVersion(),
      client,
    },
    now: frozenNow,
  });

  assert.equal(result.ok, true);
  assert.equal(helper.getFriendOfRubyStripeApiVersion(), validApiVersion);
  assert.doesNotMatch(JSON.stringify(result), /\bsk_(?:test|live)_/);
});

test("Friend of Ruby Stripe helper remains server-only and metadata-only", async () => {
  const source = await readFile(friendOfRubyStripeModulePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/billing\/stripe["']/);
  assert.match(source, /\bstripeBillingApiVersion\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /\bserverEnv\b|\bprocess\.env\b/);
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
    "secretKey",
    "webhookSecret",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${privateFragment}\\b`),
      `Friend of Ruby Stripe helper must not reference private/payment field "${privateFragment}"`,
    );
  }
});

test("client-facing code cannot import the Friend of Ruby Stripe helper", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isFriendOfRubyStripeHelperImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function loadFriendOfRubyStripeHelper() {
  const source = await readFile(friendOfRubyStripeModulePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(/import\s+type Stripe from ["']stripe["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+stripeBillingApiVersion,\n\s+type StripeBillingContext,\n\}\s+from\s+["']@\/lib\/billing\/stripe["'];\n/,
      `const stripeBillingApiVersion = "${validApiVersion}";\n`,
    )
    .replace(
      /import\s+type \{ FriendOfRubyBatchMetadata \} from ["']@\/lib\/friend-of-ruby\/batches["'];\n\n/,
      "",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: friendOfRubyStripeModulePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: friendOfRubyStripeModulePath,
    },
  );

  return commonJsModule.exports;
}

function createMockStripeClient({
  couponError = null,
  couponId = "coupon_rw_synthetic_friend_001",
  promotionCodeError = null,
  promotionCodeId = "promo_rw_synthetic_friend_001",
} = {}) {
  const calls = [];
  const client = {
    coupons: {
      create(params, options) {
        calls.push({ operation: "coupon.create", options, params });

        if (couponError) {
          return Promise.reject(new Error(couponError));
        }

        return Promise.resolve({ id: couponId });
      },
    },
    promotionCodes: {
      create(params, options) {
        calls.push({ operation: "promotionCode.create", options, params });

        if (promotionCodeError) {
          return Promise.reject(new Error(promotionCodeError));
        }

        return Promise.resolve({
          code: params.code,
          id: promotionCodeId,
        });
      },
    },
  };

  return { calls, client };
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }

      if (entry.isFile() && sourceFileExtensions.has(path.extname(entry.name))) {
        return [entryPath];
      }

      return [];
    }),
  );

  return filePaths.flat();
}

function isClientFacingSource(filePath, source) {
  const relativePath = normalizePath(path.relative(srcRoot, filePath));

  if (relativePath === "config/client.ts") {
    return true;
  }

  if (/^["']use client["'];/.test(source.trimStart())) {
    return true;
  }

  return (
    relativePath.startsWith("app/") &&
    !relativePath.startsWith("app/api/") &&
    /(?:page|layout|loading|error|not-found)\.tsx?$/.test(relativePath)
  );
}

function extractModuleSpecifiers(source) {
  const moduleSpecifiers = [];
  const importExportRegex =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importExportRegex)) {
    moduleSpecifiers.push(match[1]);
  }

  for (const match of source.matchAll(dynamicImportRegex)) {
    moduleSpecifiers.push(match[1]);
  }

  return moduleSpecifiers;
}

function isFriendOfRubyStripeHelperImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/friend-of-ruby/stripe" ||
    resolvedPath === friendOfRubyStripeModulePath
  );
}

function resolveModuleSpecifier(importerPath, moduleSpecifier) {
  if (moduleSpecifier.startsWith("@/")) {
    return resolveTypeScriptPath(path.join(srcRoot, moduleSpecifier.slice(2)));
  }

  if (moduleSpecifier.startsWith(".")) {
    return resolveTypeScriptPath(
      path.resolve(path.dirname(importerPath), moduleSpecifier),
    );
  }

  return moduleSpecifier;
}

function resolveTypeScriptPath(filePath) {
  if (sourceFileExtensions.has(path.extname(filePath))) {
    return filePath;
  }

  return `${filePath}.ts`;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
