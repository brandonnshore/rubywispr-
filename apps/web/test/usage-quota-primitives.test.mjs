import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

const forbiddenPrivateContentPattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private prompt|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("billable output word counting handles beta text shapes", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(usageQuota.countRubyWhisperBillableOutputWords(""), 0);
  assert.equal(usageQuota.countRubyWhisperBillableOutputWords("   \n\t  "), 0);
  assert.equal(
    usageQuota.countRubyWhisperBillableOutputWords("Hello, RubyWhisper."),
    2,
  );
  assert.equal(
    usageQuota.countRubyWhisperBillableOutputWords(
      "We're testing state-of-the-art dictation.",
    ),
    7,
  );
  assert.equal(
    usageQuota.countRubyWhisperBillableOutputWords("naïve café １２３"),
    3,
  );
  assert.equal(
    usageQuota.countRubyWhisperBillableOutputWords("こんにちは 世界 🚀"),
    2,
  );
});

test("trial quota state clamps unsafe counters and applies the default limit", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.equal(usageQuota.rubyWhisperDefaultTrialWordsLimit, 5_000);
  assert.equal(usageQuota.rubyWhisperTrialLowWordsRemainingThreshold, 500);

  assert.deepEqual(usageQuota.createRubyWhisperTrialQuotaState(), {
    isTrialExhausted: false,
    isTrialLow: false,
    trialWordsLimit: 5_000,
    trialWordsRemaining: 5_000,
    trialWordsUsed: 0,
  });

  assert.deepEqual(
    usageQuota.createRubyWhisperTrialQuotaState({
      trialWordsLimit: 5_000,
      trialWordsUsed: 4_750.9,
    }),
    {
      isTrialExhausted: false,
      isTrialLow: true,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 250,
      trialWordsUsed: 4_750,
    },
  );

  assert.deepEqual(
    usageQuota.createRubyWhisperTrialQuotaState({
      trialWordsLimit: Number.NaN,
      trialWordsUsed: -20,
    }),
    {
      isTrialExhausted: false,
      isTrialLow: false,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 5_000,
      trialWordsUsed: 0,
    },
  );

  assert.deepEqual(
    usageQuota.createRubyWhisperTrialQuotaState({
      trialWordsLimit: 5_000,
      trialWordsUsed: 9_500,
    }),
    {
      isTrialExhausted: true,
      isTrialLow: false,
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
  );
});

test("usage quota state represents trial, paid, friend, and blocked outcomes", async () => {
  const usageQuota = await loadUsageQuotaModule();

  assert.deepEqual(
    usageQuota.createRubyWhisperUsageQuotaState({
      trialWordsLimit: 5_000,
      trialWordsUsed: 4_999,
    }),
    {
      canTranscribe: true,
      isTrialExhausted: false,
      isTrialLow: true,
      planState: "trial_active",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 1,
      trialWordsUsed: 4_999,
    },
  );

  assert.deepEqual(
    usageQuota.createRubyWhisperUsageQuotaState({
      trialWordsLimit: 5_000,
      trialWordsUsed: 5_000,
    }),
    {
      canTranscribe: false,
      isTrialExhausted: true,
      isTrialLow: false,
      planState: "trial_exhausted",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
  );

  assert.equal(
    usageQuota.createRubyWhisperUsageQuotaState({
      hasActiveSubscription: true,
      trialWordsUsed: 5_000,
    }).planState,
    "paid_active",
  );
  assert.equal(
    usageQuota.createRubyWhisperUsageQuotaState({
      hasActiveSubscription: true,
      trialWordsUsed: 5_000,
    }).canTranscribe,
    true,
  );

  assert.equal(
    usageQuota.createRubyWhisperUsageQuotaState({
      friendOfRubyUntil: "2026-06-01T00:00:00.000Z",
      hasActiveSubscription: true,
      now: "2026-05-04T00:00:00.000Z",
      trialWordsUsed: 5_000,
    }).planState,
    "friend_of_ruby_active",
  );

  assert.deepEqual(
    usageQuota.createRubyWhisperUsageQuotaState({
      friendOfRubyUntil: "2026-04-01T00:00:00.000Z",
      now: "2026-05-04T00:00:00.000Z",
      trialWordsUsed: 5_000,
    }),
    {
      canTranscribe: false,
      isTrialExhausted: true,
      isTrialLow: false,
      planState: "trial_exhausted",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
  );

  assert.deepEqual(
    usageQuota.createRubyWhisperUsageQuotaState({
      isBlocked: true,
      trialWordsUsed: 120,
    }),
    {
      canTranscribe: false,
      isTrialExhausted: false,
      isTrialLow: false,
      planState: "blocked",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 4_880,
      trialWordsUsed: 120,
    },
  );

  assert.equal(
    usageQuota.createRubyWhisperUsageQuotaState({
      paymentFailed: true,
      trialWordsUsed: 120,
    }).planState,
    "payment_failed",
  );
});

test("usage quota primitive remains server-only and metadata-only", async () => {
  const source = await readFile(usageQuotaPath, "utf8");
  const usageQuota = await loadUsageQuotaModule();

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

  const result = usageQuota.createRubyWhisperUsageQuotaState({
    planState: "trial_active",
    trialWordsUsed: usageQuota.countRubyWhisperBillableOutputWords(
      "private transcript should only become a numeric count",
    ),
  });

  assert.deepEqual(result, {
    canTranscribe: true,
    isTrialExhausted: false,
    isTrialLow: false,
    planState: "trial_active",
    trialWordsLimit: 5_000,
    trialWordsRemaining: 4_992,
    trialWordsUsed: 8,
  });
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateContentPattern);
});

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
