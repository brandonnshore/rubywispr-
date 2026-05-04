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

const forbiddenPrivateUsageFragments = [
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

test("usage counter helper returns safe defaults for missing rows", async () => {
  const helper = await loadUsageCountersHelper();
  const { calls, client } = createUsageCountersClient({ row: null });

  const result = await helper.readRubyWhisperUsageCounters(
    {
      clerkUserId: " user_rw_synthetic_member_001 ",
      now: "2026-05-04T05:00:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "defaulted",
    counters: {
      clerkUserId: "user_rw_synthetic_member_001",
      isTrialExhausted: false,
      isTrialLow: false,
      lifetimeWordsUsed: 0,
      monthlyPeriodStart: "2026-05-01",
      monthlyWordsUsed: 0,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 5_000,
      trialWordsUsed: 0,
    },
    ok: true,
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "usage_counters" },
    {
      columns:
        "clerk_user_id,trial_words_used,lifetime_words_used,monthly_words_used,monthly_period_start,updated_at",
      operation: "select",
    },
    {
      clerkUserId: "user_rw_synthetic_member_001",
      columnName: "clerk_user_id",
      operation: "eq",
    },
    { operation: "maybeSingle", phase: "read" },
  ]);
});

test("usage counter helper normalizes existing metadata rows", async () => {
  const helper = await loadUsageCountersHelper();
  const row = {
    clerk_user_id: "user_rw_synthetic_member_001",
    lifetime_words_used: 260.9,
    monthly_period_start: "2026-05-01",
    monthly_words_used: 120.2,
    trial_words_used: 4_999.9,
    updated_at: "2026-05-04T05:10:00.000Z",
  };
  const { client } = createUsageCountersClient({ row });

  const result = await helper.readRubyWhisperUsageCounters(
    {
      clerkUserId: "user_rw_synthetic_member_001",
      now: "2026-05-04T05:00:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    counters: {
      clerkUserId: "user_rw_synthetic_member_001",
      isTrialExhausted: false,
      isTrialLow: true,
      lifetimeWordsUsed: 260,
      monthlyPeriodStart: "2026-05-01",
      monthlyWordsUsed: 120,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 1,
      trialWordsUsed: 4_999,
      updatedAt: "2026-05-04T05:10:00.000Z",
    },
    ok: true,
  });
});

test("usage increment payloads are metadata-only and reset monthly periods", async () => {
  const helper = await loadUsageCountersHelper();

  const result = helper.prepareRubyWhisperUsageCounterIncrement({
    billableWordCount: 8.8,
    clerkUserId: " user_rw_synthetic_member_001 ",
    currentCounters: {
      clerkUserId: "user_rw_synthetic_member_001",
      lifetimeWordsUsed: 260,
      monthlyPeriodStart: "2026-04-01",
      monthlyWordsUsed: 120,
      trialWordsUsed: 4_980,
    },
    now: "2026-05-04T05:15:30.000Z",
  });

  assert.deepEqual(toPlainObject(result), {
    action: "prepared",
    counters: {
      clerkUserId: "user_rw_synthetic_member_001",
      isTrialExhausted: false,
      isTrialLow: true,
      lifetimeWordsUsed: 268,
      monthlyPeriodStart: "2026-05-01",
      monthlyWordsUsed: 8,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 12,
      trialWordsUsed: 4_988,
      updatedAt: "2026-05-04T05:15:30.000Z",
    },
    ok: true,
    usageCounter: {
      clerk_user_id: "user_rw_synthetic_member_001",
      lifetime_words_used: 268,
      monthly_period_start: "2026-05-01",
      monthly_words_used: 8,
      trial_words_used: 4_988,
      updated_at: "2026-05-04T05:15:30.000Z",
    },
  });
  assert.deepEqual(Object.keys(result.usageCounter).sort(), [
    "clerk_user_id",
    "lifetime_words_used",
    "monthly_period_start",
    "monthly_words_used",
    "trial_words_used",
    "updated_at",
  ]);
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

test("usage increment upsert writes through service-role Supabase access", async () => {
  const helper = await loadUsageCountersHelper();
  const upsertRow = {
    clerk_user_id: "user_rw_synthetic_member_001",
    lifetime_words_used: 268,
    monthly_period_start: "2026-05-01",
    monthly_words_used: 128,
    trial_words_used: 128,
    updated_at: "2026-05-04T05:15:30.000Z",
  };
  const { calls, client } = createUsageCountersClient({ upsertRow });

  const result = await helper.upsertRubyWhisperUsageCounterIncrement(
    {
      billableWordCount: 8,
      clerkUserId: "user_rw_synthetic_member_001",
      currentCounters: {
        clerkUserId: "user_rw_synthetic_member_001",
        lifetimeWordsUsed: 260,
        monthlyPeriodStart: "2026-05-01",
        monthlyWordsUsed: 120,
        trialWordsUsed: 120,
      },
      now: "2026-05-04T05:15:30.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "upserted",
    counters: {
      clerkUserId: "user_rw_synthetic_member_001",
      isTrialExhausted: false,
      isTrialLow: false,
      lifetimeWordsUsed: 268,
      monthlyPeriodStart: "2026-05-01",
      monthlyWordsUsed: 128,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 4_872,
      trialWordsUsed: 128,
      updatedAt: "2026-05-04T05:15:30.000Z",
    },
    ok: true,
    usageCounter: {
      clerk_user_id: "user_rw_synthetic_member_001",
      lifetime_words_used: 268,
      monthly_period_start: "2026-05-01",
      monthly_words_used: 128,
      trial_words_used: 128,
      updated_at: "2026-05-04T05:15:30.000Z",
    },
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "usage_counters" },
    {
      operation: "upsert",
      options: { onConflict: "clerk_user_id" },
      usageCounter: {
        clerk_user_id: "user_rw_synthetic_member_001",
        lifetime_words_used: 268,
        monthly_period_start: "2026-05-01",
        monthly_words_used: 128,
        trial_words_used: 128,
        updated_at: "2026-05-04T05:15:30.000Z",
      },
    },
    {
      columns:
        "clerk_user_id,trial_words_used,lifetime_words_used,monthly_words_used,monthly_period_start,updated_at",
      operation: "select_after_upsert",
    },
    { operation: "maybeSingle", phase: "upsert" },
  ]);
});

test("usage counter helper returns sanitized failures and skips invalid clients", async () => {
  const helper = await loadUsageCountersHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperUsageCounters(
        { clerkUserId: " " },
        () => {
          throw new Error("Client factory must not be called for invalid input.");
        },
      ),
    ),
    {
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required for usage counter metadata.",
      },
      ok: false,
      status: "missing_user",
    },
  );

  const { client: readFailureClient } = createUsageCountersClient({
    readError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperUsageCounters(
        { clerkUserId: "user_rw_synthetic_member_001" },
        () => readFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_usage_counters_read_failed",
        message: "Unable to read usage counter metadata.",
      },
      ok: false,
      status: "read_failed",
    },
  );

  const { client: writeFailureClient } = createUsageCountersClient({
    writeError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.upsertRubyWhisperUsageCounterIncrement(
        {
          billableWordCount: 8,
          clerkUserId: "user_rw_synthetic_member_001",
          now: "2026-05-04T05:15:30.000Z",
        },
        () => writeFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_usage_counters_write_failed",
        message: "Unable to write usage counter metadata.",
      },
      ok: false,
      status: "write_failed",
    },
  );
});

test("usage counter helper remains server-only and metadata-only", async () => {
  const source = await readFile(usageCountersPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\busage_counters\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const fragment of forbiddenPrivateUsageFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`),
      `usage counter helper must not reference private content field "${fragment}"`,
    );
  }
});

async function loadUsageCountersHelper() {
  const quotaPrimitives = await loadUsageQuotaModule();
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

function createUsageCountersClient({
  readError = null,
  row = null,
  upsertRow = null,
  writeError = null,
} = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        select(columns) {
          calls.push({ columns, operation: "select" });

          return {
            eq(columnName, clerkUserId) {
              calls.push({ clerkUserId, columnName, operation: "eq" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "read" });

                  return Promise.resolve({ data: row, error: readError });
                },
              };
            },
          };
        },
        upsert(usageCounter, options) {
          calls.push({ operation: "upsert", options, usageCounter });

          return {
            select(columns) {
              calls.push({ columns, operation: "select_after_upsert" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "upsert" });

                  return Promise.resolve({
                    data: upsertRow,
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

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
