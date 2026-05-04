import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const usageQuotaModulePath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "quota.ts",
);

test("billable output word counting handles blank text and whitespace", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(usageQuota.countBillableOutputWords(""), 0);
  assert.equal(usageQuota.countBillableOutputWords(" \n\t  "), 0);
  assert.equal(usageQuota.countBillableOutputWords(null), 0);
  assert.equal(usageQuota.countBillableOutputWords(undefined), 0);
  assert.equal(usageQuota.countBillableOutputWords(" one   two\nthree "), 3);
});

test("billable output word counting is deterministic for punctuation", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(
    usageQuota.countBillableOutputWords("Hello, world! RubyWhisper works."),
    4,
  );
  assert.equal(
    usageQuota.countBillableOutputWords("Wait... really? Yes: really."),
    4,
  );
  assert.equal(
    usageQuota.countBillableOutputWords("Parentheses (and brackets) count cleanly."),
    5,
  );
});

test("billable output word counting treats contractions and hyphenated words as single words", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(
    usageQuota.countBillableOutputWords("Don't split RubyWhisper's cleaned-up output."),
    5,
  );
  assert.equal(
    usageQuota.countBillableOutputWords("Curly apostrophes don’t break beta-counting."),
    5,
  );
  assert.equal(
    usageQuota.countBillableOutputWords("State-of-the-art non\u2011breaking hyphens count."),
    4,
  );
});

test("billable output word counting handles Unicode letters safely", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(
    usageQuota.countBillableOutputWords("Café déjà vu. こんにちは 世界 Привет мир."),
    7,
  );
  assert.equal(
    usageQuota.countBillableOutputWords("Emoji 🎙️ are ignored unless words surround them."),
    7,
  );
});

test("trial quota helpers clamp counters and enforce the default limit", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(usageQuota.rubyWhisperTrialWordsDefaultLimit, 5_000);
  assert.equal(usageQuota.normalizeUsageCounter(-1), 0);
  assert.equal(usageQuota.normalizeUsageCounter(Number.NaN), 0);
  assert.equal(usageQuota.normalizeUsageCounter(3.9), 3);
  assert.equal(usageQuota.normalizeTrialWordsLimit(undefined), 5_000);
  assert.equal(usageQuota.normalizeTrialWordsLimit(-50), 5_000);
  assert.equal(usageQuota.getTrialWordsRemaining({ trialWordsUsed: -25 }), 5_000);
  assert.equal(usageQuota.getTrialWordsRemaining({ trialWordsUsed: 4_999 }), 1);
  assert.equal(usageQuota.getTrialWordsRemaining({ trialWordsUsed: 5_001 }), 0);
  assert.equal(
    usageQuota.isTrialQuotaExhausted({ trialWordsLimit: 10, trialWordsUsed: 10 }),
    true,
  );
});

test("trial quota snapshots expose active, low, and exhausted metadata states", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.deepEqual(
    usageQuota.deriveTrialQuotaSnapshot({ trialWordsUsed: 120 }),
    {
      exhausted: false,
      low: false,
      state: "trial_active",
      trialWordsLimit: 5_000,
      trialWordsLowRemainingThreshold: 500,
      trialWordsRemaining: 4_880,
      trialWordsUsed: 120,
    },
  );
  assert.deepEqual(
    usageQuota.deriveTrialQuotaSnapshot({ trialWordsUsed: 4_500 }),
    {
      exhausted: false,
      low: true,
      state: "trial_low",
      trialWordsLimit: 5_000,
      trialWordsLowRemainingThreshold: 500,
      trialWordsRemaining: 500,
      trialWordsUsed: 4_500,
    },
  );
  assert.deepEqual(
    usageQuota.deriveTrialQuotaSnapshot({ trialWordsUsed: 5_000 }),
    {
      exhausted: true,
      low: false,
      state: "trial_exhausted",
      trialWordsLimit: 5_000,
      trialWordsLowRemainingThreshold: 500,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
  );
});

test("quota state snapshots represent paid, Friend of Ruby, blocked, and subscription-required states without live services", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(
    usageQuota.deriveRubyWhisperQuotaState({ paid: true, trialWordsUsed: 5_000 })
      .state,
    "paid_active",
  );
  assert.equal(
    usageQuota.deriveRubyWhisperQuotaState({ friendOfRuby: true }).state,
    "friend_of_ruby_active",
  );
  assert.deepEqual(
    pickStateFields(usageQuota.deriveRubyWhisperQuotaState({ blocked: true })),
    {
      canTranscribe: false,
      entitlement: "blocked",
      requiresSubscription: false,
      state: "blocked",
    },
  );
  assert.deepEqual(
    pickStateFields(
      usageQuota.deriveRubyWhisperQuotaState({ subscriptionRequired: true }),
    ),
    {
      canTranscribe: false,
      entitlement: "subscription_required",
      requiresSubscription: true,
      state: "subscription_required",
    },
  );
});

test("quota state snapshots keep trial exhaustion metadata-only", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.deepEqual(
    pickStateFields(
      usageQuota.deriveRubyWhisperQuotaState({ trialWordsUsed: 5_000 }),
    ),
    {
      canTranscribe: false,
      entitlement: "trial",
      requiresSubscription: true,
      state: "trial_exhausted",
    },
  );
});

test("usage quota helper is server-only, framework-neutral, and has no log sink", async () => {
  const source = await readFile(usageQuotaModulePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /from\s+["']next(?:\/|["'])/);
  assert.doesNotMatch(source, /from\s+["']@supabase\/supabase-js["']/);
  assert.doesNotMatch(source, /from\s+["']@clerk\//);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /audio|clipboard|context|rawTranscript|transcript/);
});

function pickStateFields(snapshot) {
  return {
    canTranscribe: snapshot.canTranscribe,
    entitlement: snapshot.entitlement,
    requiresSubscription: snapshot.requiresSubscription,
    state: snapshot.state,
  };
}

async function loadUsageQuotaModule() {
  const source = await readFile(usageQuotaModulePath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: usageQuotaModulePath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
