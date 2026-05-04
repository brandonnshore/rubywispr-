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
const usageQuotaPath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "quota.ts",
);
const usageCountersPath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "supabase-usage-counters.ts",
);
const quotaServicePath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "quota-service.ts",
);

const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private prompt|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("quota entitlement allows trial users who start under the limit", async () => {
  const service = await loadQuotaServiceModule();

  assert.deepEqual(
    toPlainObject(
      service.evaluateRubyWhisperQuotaEntitlement({
        usageCounters: usageCounters({ trialWordsUsed: 4_999 }),
      }),
    ),
    {
      canTranscribe: true,
      metadata: {
        isTrialLow: true,
        planState: "trial_active",
        trialWordsLimit: 5_000,
        trialWordsRemaining: 1,
        trialWordsUsed: 4_999,
      },
      ok: true,
      planState: "trial_active",
      preflightPolicy: "allow_if_started_under_limit",
      status: "allowed",
    },
  );

  const increment = service.prepareRubyWhisperQuotaUsageIncrement({
    billableWordCount: 8,
    now: "2026-05-04T05:45:00.000Z",
    usageCounters: usageCounters({ trialWordsUsed: 4_999 }),
  });

  assert.deepEqual(toPlainObject(increment), {
    billableWordCount: 8,
    counters: {
      clerkUserId: "user_rw_synthetic_member_001",
      isTrialExhausted: true,
      isTrialLow: false,
      lifetimeWordsUsed: 8,
      monthlyPeriodStart: "2026-05-01",
      monthlyWordsUsed: 8,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
      updatedAt: "2026-05-04T05:45:00.000Z",
    },
    ok: true,
    planState: "trial_active",
    preflightPolicy: "allow_if_started_under_limit",
    usageCounter: {
      clerk_user_id: "user_rw_synthetic_member_001",
      lifetime_words_used: 8,
      monthly_period_start: "2026-05-01",
      monthly_words_used: 8,
      trial_words_used: 5_007,
      updated_at: "2026-05-04T05:45:00.000Z",
    },
    willExhaustTrial: true,
  });
});

test("quota entitlement rejects trial users at or over the limit", async () => {
  const service = await loadQuotaServiceModule();

  for (const trialWordsUsed of [5_000, 6_000]) {
    assert.deepEqual(
      toPlainObject(
        service.evaluateRubyWhisperQuotaEntitlement({
          usageCounters: usageCounters({ trialWordsUsed }),
        }),
      ),
      {
        canTranscribe: false,
        errorCode: "trial_exhausted",
        metadata: {
          isTrialLow: false,
          planState: "trial_exhausted",
          trialWordsLimit: 5_000,
          trialWordsRemaining: 0,
          trialWordsUsed: 5_000,
        },
        ok: false,
        planState: "trial_exhausted",
        preflightPolicy: "allow_if_started_under_limit",
        status: "trial_exhausted",
      },
    );
  }
});

test("paid and Friend users are allowed without spending trial words", async () => {
  const service = await loadQuotaServiceModule();

  const paidIncrement = service.prepareRubyWhisperQuotaUsageIncrement({
    billableWordCount: 12,
    now: "2026-05-04T05:45:00.000Z",
    subscriptionStatus: "active",
    usageCounters: usageCounters({
      lifetimeWordsUsed: 100,
      monthlyWordsUsed: 20,
      trialWordsUsed: 5_000,
    }),
  });

  assert.equal(paidIncrement.planState, "paid_active");
  assert.equal(paidIncrement.usageCounter.trial_words_used, 5_000);
  assert.equal(paidIncrement.usageCounter.lifetime_words_used, 112);
  assert.equal(paidIncrement.usageCounter.monthly_words_used, 32);
  assert.equal(paidIncrement.willExhaustTrial, false);

  const friendEntitlement = service.evaluateRubyWhisperQuotaEntitlement({
    friendOfRubyUntil: "2026-06-01T00:00:00.000Z",
    now: "2026-05-04T05:45:00.000Z",
    usageCounters: usageCounters({ trialWordsUsed: 5_000 }),
  });

  assert.deepEqual(toPlainObject(friendEntitlement), {
    canTranscribe: true,
    metadata: {
      isTrialLow: false,
      planState: "friend_of_ruby_active",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
    ok: true,
    planState: "friend_of_ruby_active",
    preflightPolicy: "allow_if_started_under_limit",
    status: "allowed",
  });
});

test("quota entitlement fails closed for blocked, payment, and subscription states", async () => {
  const service = await loadQuotaServiceModule();

  assert.equal(
    service.evaluateRubyWhisperQuotaEntitlement({
      isBlocked: true,
      usageCounters: usageCounters({ trialWordsUsed: 120 }),
    }).errorCode,
    "account_blocked",
  );
  assert.equal(
    service.evaluateRubyWhisperQuotaEntitlement({
      subscriptionStatus: "past_due",
      usageCounters: usageCounters({ trialWordsUsed: 120 }),
    }).errorCode,
    "payment_failed",
  );
  assert.equal(
    service.evaluateRubyWhisperQuotaEntitlement({
      requiresSubscription: true,
      usageCounters: usageCounters({ trialWordsUsed: 120 }),
    }).errorCode,
    "subscription_required",
  );
});

test("quota service remains server-only and returns metadata-only results", async () => {
  const service = await loadQuotaServiceModule();
  const source = await readFile(quotaServicePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["']next\/server["']/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);

  for (const privateKey of [
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
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${privateKey}\\b`));
  }

  const result = service.prepareRubyWhisperQuotaUsageIncrement({
    billableWordCount: 7,
    usageCounters: usageCounters({ trialWordsUsed: 120 }),
  });

  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

async function loadQuotaServiceModule() {
  const quotaPrimitives = await loadUsageQuotaModule();
  const usageCountersHelper = await loadUsageCountersHelper(quotaPrimitives);
  const source = await readFile(quotaServicePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createRubyWhisperUsageQuotaState,\n\s+normalizeRubyWhisperUsageWordCount,\n\s+type RubyWhisperUsagePlanState,\n\}\s+from\s+["']\.\/quota["'];\n/,
      "const { createRubyWhisperUsageQuotaState, normalizeRubyWhisperUsageWordCount } = quotaPrimitives;\n",
    )
    .replace(
      /import\s+\{\n\s+prepareRubyWhisperUsageCounterIncrement,\n\s+type RubyWhisperUsageCounters,\n\s+type SupabaseUsageCounterUpsert,\n\}\s+from\s+["']\.\/supabase-usage-counters["'];\n\n/,
      "const { prepareRubyWhisperUsageCounterIncrement } = usageCountersHelper;\n\n",
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
      usageCountersHelper,
    },
    {
      filename: quotaServicePath,
    },
  );

  return commonJsModule.exports;
}

async function loadUsageCountersHelper(quotaPrimitives) {
  const source = await readFile(usageCountersPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    )
    .replace(
      /import\s+\{\n\s+createRubyWhisperTrialQuotaState,\n\s+normalizeRubyWhisperUsageWordCount,\n\s+rubyWhisperDefaultTrialWordsLimit,\n\s+type RubyWhisperTrialQuotaState,\n\}\s+from\s+["']\.\/quota["'];\n\n/,
      "const { createRubyWhisperTrialQuotaState, normalizeRubyWhisperUsageWordCount, rubyWhisperDefaultTrialWordsLimit } = quotaPrimitives;\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: usageCountersPath,
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
      filename: usageCountersPath,
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

function usageCounters(overrides = {}) {
  const trialWordsLimit = 5_000;
  const trialWordsUsed = Math.min(
    Math.max(0, Math.floor(overrides.trialWordsUsed ?? 120)),
    trialWordsLimit,
  );
  const trialWordsRemaining = Math.max(0, trialWordsLimit - trialWordsUsed);

  return {
    clerkUserId: "user_rw_synthetic_member_001",
    isTrialExhausted: trialWordsRemaining === 0,
    isTrialLow: trialWordsRemaining > 0 && trialWordsRemaining <= 500,
    lifetimeWordsUsed: overrides.lifetimeWordsUsed ?? 0,
    monthlyPeriodStart: overrides.monthlyPeriodStart ?? "2026-05-01",
    monthlyWordsUsed: overrides.monthlyWordsUsed ?? 0,
    trialWordsLimit,
    trialWordsRemaining,
    trialWordsUsed,
    ...(overrides.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
