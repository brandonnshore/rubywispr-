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
const accountSnapshotPath = path.join(
  webRoot,
  "src",
  "lib",
  "account",
  "desktop-account-snapshot.ts",
);
const usageQuotaPath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "quota.ts",
);
const quotaServicePath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "quota-service.ts",
);

const forbiddenPrivateAccountFragments = [
  "audio",
  "rawTranscript",
  "transcript",
  "cleanedText",
  "context",
  "clipboard",
  "dictionaryTerms",
  "prompt",
  "providerRequestBody",
  "providerResponseBody",
  "authorization",
  "token",
  "secret",
];
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private prompt|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("desktop account snapshot composes active trial metadata", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    now: "2026-05-04T05:00:00.000Z",
    profile: profileMetadata(),
    subscription: subscriptionMetadata(),
    usageCounters: usageCounters({ trialWordsUsed: 1_000 }),
  });

  assert.deepEqual(toPlainObject(result), {
    action: "created",
    ok: true,
    snapshot: {
      accountStatus: "active",
      billingPortalAvailable: false,
      billingPortalUrl: null,
      canTranscribe: true,
      email: "member@example.com",
      isTrialExhausted: false,
      isTrialLow: false,
      lifetimeWordsUsed: 1_000,
      monthlyPeriodStart: "2026-05-01",
      monthlyWordsUsed: 1_000,
      planState: "trial_active",
      preflightPolicy: "allow_if_started_under_limit",
      termsAccepted: true,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 4_000,
      trialWordsUsed: 1_000,
    },
  });
});

test("desktop account snapshot surfaces low trial state with contract names", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata(),
    subscription: subscriptionMetadata(),
    usageCounters: usageCounters({ monthlyWordsUsed: 4_800, trialWordsUsed: 4_800 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "active");
  assert.equal(result.snapshot.isTrialLow, true);
  assert.equal(result.snapshot.isTrialExhausted, false);
  assert.equal(result.snapshot.trialWordsRemaining, 200);
  assert.deepEqual(Object.keys(result.snapshot).sort(), [
    "accountStatus",
    "billingPortalAvailable",
    "billingPortalUrl",
    "canTranscribe",
    "email",
    "isTrialExhausted",
    "isTrialLow",
    "lifetimeWordsUsed",
    "monthlyPeriodStart",
    "monthlyWordsUsed",
    "planState",
    "preflightPolicy",
    "termsAccepted",
    "trialWordsLimit",
    "trialWordsRemaining",
    "trialWordsUsed",
  ]);
});

test("desktop account snapshot fails closed for exhausted trials", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata(),
    subscription: subscriptionMetadata(),
    usageCounters: usageCounters({ trialWordsUsed: 5_000 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "trial_exhausted");
  assert.equal(result.snapshot.canTranscribe, false);
  assert.equal(result.snapshot.failureCode, "trial_exhausted");
  assert.equal(result.snapshot.isTrialExhausted, true);
  assert.equal(result.snapshot.planState, "trial_exhausted");
  assert.equal(result.snapshot.trialWordsRemaining, 0);
});

test("desktop account snapshot allows paid users without hiding usage metadata", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata(),
    subscription: subscriptionMetadata({
      hasActiveSubscription: true,
      plan: "monthly",
      planState: "paid_active",
      subscriptionStatus: "active",
    }),
    usageCounters: usageCounters({
      lifetimeWordsUsed: 12_000,
      monthlyWordsUsed: 7_500,
      trialWordsUsed: 5_000,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "active");
  assert.equal(result.snapshot.canTranscribe, true);
  assert.equal(result.snapshot.failureCode, undefined);
  assert.equal(result.snapshot.isTrialExhausted, true);
  assert.equal(result.snapshot.monthlyWordsUsed, 7_500);
  assert.equal(result.snapshot.planState, "paid_active");
  assert.equal(result.snapshot.trialWordsRemaining, 0);
});

test("desktop account snapshot allows active Friend of Ruby entitlement", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    now: "2026-05-04T05:00:00.000Z",
    profile: profileMetadata(),
    subscription: subscriptionMetadata({
      friendOfRubyUntil: "2027-05-04T05:00:00.000Z",
      hasActiveSubscription: true,
      isFriendOfRubyActive: true,
      plan: "friend_of_ruby",
      planState: "friend_of_ruby_active",
      subscriptionStatus: "active",
    }),
    usageCounters: usageCounters({ trialWordsUsed: 5_000 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "active");
  assert.equal(result.snapshot.canTranscribe, true);
  assert.equal(result.snapshot.failureCode, undefined);
  assert.equal(result.snapshot.planState, "friend_of_ruby_active");
});

test("desktop account snapshot rejects expired Friend of Ruby entitlement", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    now: "2026-05-04T05:00:00.000Z",
    profile: profileMetadata(),
    subscription: subscriptionMetadata({
      friendOfRubyUntil: "2026-04-04T05:00:00.000Z",
      isFriendOfRubyActive: false,
      plan: "friend_of_ruby",
      planState: "subscription_required",
      requiresSubscription: true,
      subscriptionStatus: "canceled",
    }),
    usageCounters: usageCounters({ trialWordsUsed: 5_000 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "subscription_required");
  assert.equal(result.snapshot.canTranscribe, false);
  assert.equal(result.snapshot.failureCode, "subscription_required");
  assert.equal(result.snapshot.planState, "subscription_required");
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

test("desktop account snapshot represents missing Terms distinctly", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata({ termsAcceptedAt: null }),
    subscription: subscriptionMetadata(),
    usageCounters: usageCounters({ trialWordsUsed: 1_000 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "terms_required");
  assert.equal(result.snapshot.canTranscribe, false);
  assert.equal(result.snapshot.failureCode, "terms_required");
  assert.equal(result.snapshot.planState, "trial_active");
  assert.equal(result.snapshot.termsAccepted, false);
});

test("desktop account snapshot fails closed for blocked accounts", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata({ isBlocked: true }),
    subscription: subscriptionMetadata(),
    usageCounters: usageCounters(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "account_blocked");
  assert.equal(result.snapshot.canTranscribe, false);
  assert.equal(result.snapshot.failureCode, "account_blocked");
  assert.equal(result.snapshot.planState, "blocked");
});

test("desktop account snapshot fails closed for payment failures", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata(),
    subscription: subscriptionMetadata({
      paymentFailed: true,
      plan: "monthly",
      planState: "payment_failed",
      subscriptionStatus: "past_due",
    }),
    usageCounters: usageCounters(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "payment_failed");
  assert.equal(result.snapshot.billingPortalAvailable, false);
  assert.equal(result.snapshot.billingPortalUrl, null);
  assert.equal(result.snapshot.canTranscribe, false);
  assert.equal(result.snapshot.failureCode, "payment_failed");
  assert.equal(result.snapshot.planState, "payment_failed");
});

test("desktop account snapshot fails closed for subscription-required states", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata(),
    subscription: subscriptionMetadata({
      plan: "monthly",
      planState: "subscription_required",
      requiresSubscription: true,
      subscriptionStatus: "canceled",
    }),
    usageCounters: usageCounters(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.accountStatus, "subscription_required");
  assert.equal(result.snapshot.canTranscribe, false);
  assert.equal(result.snapshot.failureCode, "subscription_required");
  assert.equal(result.snapshot.planState, "subscription_required");
});

test("desktop account snapshot rejects mismatched account metadata safely", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata({ clerkUserId: "user_rw_synthetic_member_001" }),
    subscription: subscriptionMetadata({
      clerkUserId: "user_rw_synthetic_member_002",
    }),
    usageCounters: usageCounters(),
  });

  assert.deepEqual(toPlainObject(result), {
    error: {
      code: "account_metadata_mismatch",
      message: "Account metadata must belong to the same Clerk user.",
    },
    ok: false,
    status: "invalid_input",
  });
});

test("desktop account snapshot remains server-only and metadata-only", async () => {
  const source = await readFile(accountSnapshotPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/usage\/quota-service["']/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bstripe_customer_id\b/);
  assert.doesNotMatch(source, /\bstripe_subscription_id\b/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const fragment of forbiddenPrivateAccountFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`),
      `desktop account snapshot must not reference private content field "${fragment}"`,
    );
  }
});

test("desktop account snapshot output rejects private and live-looking fields", async () => {
  const helper = await loadDesktopAccountSnapshotHelper();
  const result = helper.createRubyWhisperDesktopAccountSnapshot({
    profile: profileMetadata(),
    subscription: subscriptionMetadata({
      hasActiveSubscription: true,
      planState: "paid_active",
      subscriptionStatus: "active",
    }),
    usageCounters: usageCounters({ trialWordsUsed: 1_000 }),
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.doesNotMatch(serialized, forbiddenPrivateFixturePattern);
  assert.doesNotMatch(serialized, /cus_|sub_|price_|sk_live_|sk_test_|whsec_/);
  assert.doesNotMatch(serialized, /subscriptionStatus|friendOfRubyUntil/);
  assert.equal(result.snapshot.billingPortalUrl, null);
});

async function loadDesktopAccountSnapshotHelper() {
  const quotaService = await loadQuotaServiceModule();
  const source = await readFile(accountSnapshotPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+type\s+\{\s+RubyWhisperSubscriptionCache\s+\}\s+from\s+["']@\/lib\/account\/subscription-cache["'];\n/,
      "",
    )
    .replace(
      /import\s+\{\n\s+evaluateRubyWhisperQuotaEntitlement,\n\s+rubyWhisperQuotaPreflightPolicy,\n\s+type RubyWhisperQuotaErrorCode,\n\}\s+from\s+["']@\/lib\/usage\/quota-service["'];\n/,
      "const { evaluateRubyWhisperQuotaEntitlement, rubyWhisperQuotaPreflightPolicy } = quotaService;\n",
    )
    .replace(
      /import\s+type\s+\{\s+RubyWhisperUsagePlanState\s+\}\s+from\s+["']@\/lib\/usage\/quota["'];\n/,
      "",
    )
    .replace(
      /import\s+type\s+\{\s+RubyWhisperUsageCounters\s+\}\s+from\s+["']@\/lib\/usage\/supabase-usage-counters["'];\n\n/,
      "\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: accountSnapshotPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      quotaService,
    },
    {
      filename: accountSnapshotPath,
    },
  );

  return commonJsModule.exports;
}

async function loadQuotaServiceModule() {
  const quotaPrimitives = await loadUsageQuotaModule();
  const source = await readFile(quotaServicePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createRubyWhisperUsageQuotaState,\n\s+normalizeRubyWhisperUsageWordCount,\n\s+type RubyWhisperUsagePlanState,\n\}\s+from\s+["']\.\/quota["'];\n/,
      "const { createRubyWhisperUsageQuotaState, normalizeRubyWhisperUsageWordCount } = quotaPrimitives;\n",
    )
    .replace(
      /import\s+\{\n\s+prepareRubyWhisperUsageCounterIncrement,\n\s+type RubyWhisperUsageCounters,\n\s+type SupabaseUsageCounterUpsert,\n\}\s+from\s+["']\.\/supabase-usage-counters["'];\n\n/,
      "const prepareRubyWhisperUsageCounterIncrement = () => { throw new Error('Usage increments are outside this account snapshot test.'); };\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: quotaServicePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      quotaPrimitives,
    },
    {
      filename: quotaServicePath,
    },
  );

  return commonJsModule.exports;
}

async function loadUsageQuotaModule() {
  const source = await readFile(usageQuotaPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: usageQuotaPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}

function profileMetadata(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    email: "member@example.com",
    isBlocked: false,
    termsAcceptedAt: "2026-05-04T05:00:00.000Z",
    ...overrides,
  };
}

function subscriptionMetadata(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    hasActiveSubscription: false,
    isFriendOfRubyActive: false,
    paymentFailed: false,
    plan: "trial",
    planState: "trial_active",
    requiresSubscription: false,
    ...overrides,
  };
}

function usageCounters(overrides = {}) {
  const trialWordsLimit = overrides.trialWordsLimit ?? 5_000;
  const trialWordsUsed = Math.min(overrides.trialWordsUsed ?? 0, trialWordsLimit);
  const trialWordsRemaining = Math.max(0, trialWordsLimit - trialWordsUsed);
  const monthlyWordsUsed = overrides.monthlyWordsUsed ?? trialWordsUsed;

  return {
    clerkUserId: "user_rw_synthetic_member_001",
    isTrialExhausted: trialWordsRemaining === 0,
    isTrialLow: trialWordsRemaining > 0 && trialWordsRemaining <= 500,
    lifetimeWordsUsed: overrides.lifetimeWordsUsed ?? monthlyWordsUsed,
    monthlyPeriodStart: overrides.monthlyPeriodStart ?? "2026-05-01",
    monthlyWordsUsed,
    trialWordsLimit,
    trialWordsRemaining,
    trialWordsUsed,
    ...overrides,
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
