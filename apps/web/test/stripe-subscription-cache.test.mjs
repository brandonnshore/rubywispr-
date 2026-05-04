import assert from "node:assert/strict";
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
const helperPath = path.join(
  webRoot,
  "src",
  "lib",
  "billing",
  "stripe-subscription-cache.ts",
);
const now = "2026-05-04T12:00:00.000Z";
const periodEnd = 1777896000;
const periodEndIso = "2026-05-04T12:00:00.000Z";
const nextPeriodEnd = 1780574400;
const nextPeriodEndIso = "2026-06-04T12:00:00.000Z";
const friendUntil = "2027-05-04T12:00:00.000Z";
const expiredFriendUntil = "2026-04-04T12:00:00.000Z";
const priceIds = {
  annual: "price_annual_synthetic",
  monthly: "price_monthly_synthetic",
};
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local|whsec_|sk_test_/i;

test("Stripe subscription cache helper upserts active monthly subscriptions", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const subscription = stripeSubscription({
    currentPeriodEnd: nextPeriodEnd,
    metadata: {
      clerkUserId: " user_rw_synthetic_member_001 ",
      rubyWhisperPlan: " monthly ",
    },
    priceId: priceIds.monthly,
    status: "active",
  });
  const { calls, client } = createSubscriptionCacheWriteClient();

  const result = await helper.upsertStripeSubscriptionCacheFromEvent(
    {
      event: stripeEvent("customer.subscription.updated", subscription),
      now,
      priceIds,
    },
    () => client,
  );
  const expectedRow = {
    clerk_user_id: "user_rw_synthetic_member_001",
    current_period_end: nextPeriodEndIso,
    friend_of_ruby_until: null,
    plan: "monthly",
    status: "active",
    stripe_customer_id: "cus_rw_synthetic_member_001",
    stripe_subscription_id: "sub_rw_synthetic_member_001",
    updated_at: now,
  };

  assert.deepEqual(toPlainObject(result), {
    action: "upserted",
    ok: true,
    row: expectedRow,
    status: "written",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "subscriptions" },
    {
      operation: "upsert",
      options: { onConflict: "clerk_user_id" },
      row: expectedRow,
    },
    {
      columns:
        "clerk_user_id,stripe_customer_id,stripe_subscription_id,status,plan,current_period_end,friend_of_ruby_until,updated_at",
      operation: "select_after_upsert",
    },
    { operation: "maybeSingle", phase: "upsert" },
  ]);
});

test("Stripe subscription cache mapper resolves active annual plans from configured prices", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.created",
      stripeSubscription({
        metadata: { clerkUserId: "user_rw_synthetic_member_002" },
        priceId: priceIds.annual,
        status: "active",
      }),
    ),
    now,
    priceIds,
  });

  assert.equal(result.ok, true);
  assert.equal(result.row.plan, "annual");
  assert.equal(result.row.status, "active");
  assert.equal(result.row.current_period_end, periodEndIso);
});

test("Stripe subscription cache mapper uses expanded customer metadata for trials", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.created",
      stripeSubscription({
        customer: stripeCustomer({
          metadata: {
            clerkUserId: "user_rw_synthetic_trial_001",
            rubyWhisperPlan: "monthly",
          },
        }),
        metadata: {},
        priceId: priceIds.monthly,
        status: "trialing",
      }),
    ),
    now,
    priceIds,
  });

  assert.deepEqual(toPlainObject(result), {
    action: "mapped",
    ok: true,
    row: {
      clerk_user_id: "user_rw_synthetic_trial_001",
      current_period_end: periodEndIso,
      friend_of_ruby_until: null,
      plan: "monthly",
      status: "trialing",
      stripe_customer_id: "cus_rw_synthetic_member_001",
      stripe_subscription_id: "sub_rw_synthetic_member_001",
      updated_at: now,
    },
    status: "mapped",
  });
});

test("Stripe subscription cache mapper marks deleted subscriptions as canceled", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.deleted",
      stripeSubscription({
        metadata: {
          clerkUserId: "user_rw_synthetic_member_001",
          rubyWhisperPlan: "annual",
        },
        priceId: priceIds.annual,
        status: "active",
      }),
    ),
    now,
    priceIds,
  });

  assert.equal(result.ok, true);
  assert.equal(result.row.plan, "annual");
  assert.equal(result.row.status, "canceled");
});

test("Stripe subscription cache mapper preserves billing attention statuses", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();

  for (const status of ["past_due", "unpaid"]) {
    const result = helper.mapStripeSubscriptionEventToCacheRow({
      event: stripeEvent(
        "customer.subscription.updated",
        stripeSubscription({
          metadata: {
            clerkUserId: "user_rw_synthetic_member_001",
            rubyWhisperPlan: "monthly",
          },
          status,
        }),
      ),
      now,
      priceIds,
    });

    assert.equal(result.ok, true);
    assert.equal(result.row.plan, "monthly");
    assert.equal(result.row.status, status);
  }
});

test("Stripe subscription cache mapper keeps Friend of Ruby metadata only", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.updated",
      stripeSubscription({
        metadata: {
          clerkUserId: "user_rw_synthetic_friend_001",
          rubyWhisperFriendOfRubyUntil: friendUntil,
        },
        priceId: "price_friend_unknown",
        status: "canceled",
      }),
    ),
    now,
    priceIds,
  });

  assert.deepEqual(toPlainObject(result), {
    action: "mapped",
    ok: true,
    row: {
      clerk_user_id: "user_rw_synthetic_friend_001",
      current_period_end: periodEndIso,
      friend_of_ruby_until: friendUntil,
      plan: "friend_of_ruby",
      status: "canceled",
      stripe_customer_id: "cus_rw_synthetic_member_001",
      stripe_subscription_id: "sub_rw_synthetic_member_001",
      updated_at: now,
    },
    status: "mapped",
  });
});

test("Stripe subscription cache mapper accepts active Friend of Ruby customer metadata", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.updated",
      stripeSubscription({
        customer: stripeCustomer({
          metadata: {
            clerkUserId: "user_rw_synthetic_friend_customer_001",
            friend_of_ruby_until: `${Math.floor(Date.parse(friendUntil) / 1000)}`,
          },
        }),
        metadata: {},
        priceId: "price_friend_unknown",
        status: "active",
      }),
    ),
    now,
    priceIds,
  });

  assert.deepEqual(toPlainObject(result), {
    action: "mapped",
    ok: true,
    row: {
      clerk_user_id: "user_rw_synthetic_friend_customer_001",
      current_period_end: periodEndIso,
      friend_of_ruby_until: friendUntil,
      plan: "friend_of_ruby",
      status: "active",
      stripe_customer_id: "cus_rw_synthetic_member_001",
      stripe_subscription_id: "sub_rw_synthetic_member_001",
      updated_at: now,
    },
    status: "mapped",
  });
});

test("Stripe subscription cache mapper does not grant expired Friend of Ruby metadata", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.updated",
      stripeSubscription({
        metadata: {
          clerkUserId: "user_rw_synthetic_friend_expired_001",
          rubyWhisperPlan: "friend_of_ruby",
          ruby_whisper_friend_of_ruby_until: expiredFriendUntil,
        },
        priceId: "price_friend_unknown",
        status: "active",
      }),
    ),
    now,
    priceIds,
  });

  assert.deepEqual(toPlainObject(result), {
    action: "mapped",
    ok: true,
    row: {
      clerk_user_id: "user_rw_synthetic_friend_expired_001",
      current_period_end: periodEndIso,
      friend_of_ruby_until: expiredFriendUntil,
      plan: "unknown",
      status: "canceled",
      stripe_customer_id: "cus_rw_synthetic_member_001",
      stripe_subscription_id: "sub_rw_synthetic_member_001",
      updated_at: now,
    },
    status: "mapped",
  });
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

test("Stripe subscription cache mapper fails safely for missing metadata and unknown active plans", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const { calls, client } = createSubscriptionCacheWriteClient();

  const missingClerk = await helper.upsertStripeSubscriptionCacheFromEvent(
    {
      event: stripeEvent(
        "customer.subscription.updated",
        stripeSubscription({
          metadata: { rubyWhisperPlan: "monthly" },
          status: "active",
        }),
      ),
      now,
      priceIds,
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(missingClerk), {
    action: "ignored",
    error: {
      code: "missing_stripe_subscription_cache_metadata",
      message: "Required Stripe subscription metadata is missing.",
    },
    ok: false,
    status: "missing_metadata",
  });
  assert.deepEqual(calls, []);

  const unknownActivePlan = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.updated",
      stripeSubscription({
        metadata: { clerkUserId: "user_rw_synthetic_member_001" },
        priceId: "price_unknown_synthetic",
        status: "active",
      }),
    ),
    now,
    priceIds,
  });

  assert.equal(unknownActivePlan.ok, true);
  assert.deepEqual(
    {
      plan: unknownActivePlan.row.plan,
      status: unknownActivePlan.row.status,
    },
    {
      plan: "unknown",
      status: "canceled",
    },
  );
});

test("Stripe subscription cache helper returns sanitized write failures", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const { client: errorClient } = createSubscriptionCacheWriteClient({
    writeError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.upsertStripeSubscriptionCacheFromEvent(
        {
          event: stripeEvent(
            "customer.subscription.updated",
            stripeSubscription({
              metadata: {
                clerkUserId: "user_rw_synthetic_member_001",
                rubyWhisperPlan: "monthly",
              },
              status: "active",
            }),
          ),
          now,
          priceIds,
        },
        () => errorClient,
      ),
    ),
    {
      action: "upsert_failed",
      error: {
        code: "supabase_subscription_cache_write_failed",
        message: "Unable to write subscription cache metadata.",
      },
      ok: false,
      status: "write_failed",
    },
  );

  const factoryFailure = await helper.upsertStripeSubscriptionCacheFromEvent(
    {
      event: stripeEvent(
        "customer.subscription.updated",
        stripeSubscription({
          metadata: {
            clerkUserId: "user_rw_synthetic_member_001",
            rubyWhisperPlan: "monthly",
          },
          status: "active",
        }),
      ),
      now,
      priceIds,
    },
    () => {
      throw new Error("service-role detail must not echo");
    },
  );

  assert.equal(factoryFailure.ok, false);
  assert.equal(factoryFailure.error.code, "supabase_subscription_cache_write_failed");
  assert.doesNotMatch(JSON.stringify(factoryFailure), /service-role|database detail/i);
});

test("Stripe subscription cache helper remains server-only and metadata-only", async () => {
  const source = await readFile(helperPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bsubscriptions\b/);
  assert.match(source, /\bupsert\b/);
  assert.match(source, /\bstripe_customer_id\b/);
  assert.match(source, /\bstripe_subscription_id\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
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
      `subscription event mapper must not reference private/payment field "${privateFragment}"`,
    );
  }
});

test("Stripe subscription cache fixture output stays metadata-only", async () => {
  const helper = await loadStripeSubscriptionCacheHelper();
  const result = helper.mapStripeSubscriptionEventToCacheRow({
    event: stripeEvent(
      "customer.subscription.updated",
      stripeSubscription({
        metadata: {
          clerkUserId: "user_rw_synthetic_member_001",
          rubyWhisperPlan: "monthly",
        },
        status: "active",
      }),
    ),
    now,
    priceIds,
  });

  assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

async function loadStripeSubscriptionCacheHelper() {
  const source = await readFile(helperPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(/import\s+type\s+Stripe\s+from\s+["']stripe["'];\n\n/, "")
    .replace(
      /import\s+type\s+\{\s+SupabaseServiceRoleClientFactory\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "",
    )
    .replace(
      /import\s+\{\s+createSupabaseServiceRoleClient\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n",
    )
    .replace(
      /import\s+type\s+\{\s+StripeBillingPriceIds,\s+StripeBillingPlan\s+\}\s+from\s+["']\.\/stripe["'];\n\n/,
      "\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: helperPath,
    },
  );

  return commonJsModule.exports;
}

function createSubscriptionCacheWriteClient({
  writeError = null,
  writtenRow,
} = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        upsert(row, options) {
          calls.push({ operation: "upsert", options, row });

          return {
            select(columns) {
              calls.push({ columns, operation: "select_after_upsert" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "upsert" });

                  return Promise.resolve({
                    data: writtenRow === undefined ? row : writtenRow,
                    error: writeError,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return { calls, client };
}

function stripeEvent(type, object) {
  return {
    data: { object },
    type,
  };
}

function stripeSubscription({
  customer = "cus_rw_synthetic_member_001",
  currentPeriodEnd = periodEnd,
  id = "sub_rw_synthetic_member_001",
  metadata = {
    clerkUserId: "user_rw_synthetic_member_001",
    rubyWhisperPlan: "monthly",
  },
  priceId = priceIds.monthly,
  status = "active",
} = {}) {
  return {
    current_period_end: currentPeriodEnd,
    customer,
    id,
    items: {
      data: [
        {
          price: {
            id: priceId,
          },
        },
      ],
    },
    metadata,
    object: "subscription",
    status,
  };
}

function stripeCustomer({
  id = "cus_rw_synthetic_member_001",
  metadata = {},
} = {}) {
  return {
    id,
    metadata,
    object: "customer",
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
