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
const fairUsePath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "fair-use.ts",
);

const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private prompt|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("fair-use signal defaults paid and Friend metadata to normal without thresholds", async () => {
  const fairUse = await loadFairUseModule();

  for (const planState of ["paid_active", "friend_of_ruby_active"]) {
    assert.deepEqual(
      fairUse.evaluateRubyWhisperFairUseSignal({
        lifetimeWordsUsed: 3_000_000,
        monthlyWordsUsed: 900_000,
        planState,
        rollingAudioDurationMs: 90_000_000,
        rollingRequestCount: 4_000,
      }),
      {
        enforce: false,
        metadata: {
          evaluated: true,
          matchedThresholds: [],
          planState,
          signal: "normal",
        },
        ok: true,
        signal: "normal",
        status: "normal",
      },
    );
  }
});

test("fair-use signal reports watch threshold matches from aggregate metadata", async () => {
  const fairUse = await loadFairUseModule();

  assert.deepEqual(
    fairUse.evaluateRubyWhisperFairUseSignal({
      monthlyWordsUsed: 50_000,
      planState: "paid_active",
      policy: {
        monthlyWordsUsed: { watch: 25_000, limitRecommended: 100_000 },
        rollingRequestCount: { watch: 1_000 },
      },
      rollingRequestCount: 999,
    }),
    {
      enforce: false,
      metadata: {
        evaluated: true,
        matchedThresholds: [
          {
            level: "watch",
            metric: "monthly_words_used",
            threshold: 25_000,
            value: 50_000,
          },
        ],
        planState: "paid_active",
        signal: "watch",
      },
      ok: true,
      signal: "watch",
      status: "watch",
    },
  );
});

test("fair-use signal reports limit recommendations without enforcing blocks", async () => {
  const fairUse = await loadFairUseModule();

  const result = fairUse.evaluateRubyWhisperFairUseSignal({
    lifetimeWordsUsed: 2_100_000.8,
    monthlyWordsUsed: 225_000,
    planState: "friend_of_ruby_active",
    policy: {
      lifetimeWordsUsed: { limitRecommended: 2_000_000 },
      monthlyWordsUsed: { watch: 200_000, limitRecommended: 500_000 },
      rollingAudioDurationMs: { limitRecommended: 3_600_000 },
      rollingRequestCount: { watch: 2_000 },
    },
    rollingAudioDurationMs: 3_700_500.7,
    rollingRequestCount: 2_100,
  });

  assert.equal(result.enforce, false);
  assert.equal(result.ok, true);
  assert.equal(result.signal, "limit_recommended");
  assert.deepEqual(result.metadata, {
    evaluated: true,
    matchedThresholds: [
      {
        level: "watch",
        metric: "monthly_words_used",
        threshold: 200_000,
        value: 225_000,
      },
      {
        level: "limit_recommended",
        metric: "lifetime_words_used",
        threshold: 2_000_000,
        value: 2_100_000,
      },
      {
        level: "watch",
        metric: "rolling_request_count",
        threshold: 2_000,
        value: 2_100,
      },
      {
        level: "limit_recommended",
        metric: "rolling_audio_duration_ms",
        threshold: 3_600_000,
        value: 3_700_500,
      },
    ],
    planState: "friend_of_ruby_active",
    signal: "limit_recommended",
  });
});

test("fair-use signal delegates trial and account entitlement states", async () => {
  const fairUse = await loadFairUseModule();

  for (const planState of [
    "trial_active",
    "trial_exhausted",
    "blocked",
    "payment_failed",
    "subscription_required",
  ]) {
    const result = fairUse.evaluateRubyWhisperFairUseSignal({
      monthlyWordsUsed: 9_999_999,
      planState,
      policy: { monthlyWordsUsed: { limitRecommended: 1 } },
    });

    assert.deepEqual(result, {
      enforce: false,
      metadata: {
        evaluated: false,
        matchedThresholds: [],
        planState: "delegated",
        signal: "delegated",
      },
      ok: true,
      signal: "delegated",
      status: "delegated",
    });
  }
});

test("fair-use signal primitive remains server-only and metadata-only", async () => {
  const source = await readFile(fairUsePath, "utf8");
  const fairUse = await loadFairUseModule();

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["']next\/server["']/);
  assert.doesNotMatch(source, /supabase/i);
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

  const result = fairUse.evaluateRubyWhisperFairUseSignal({
    cleanedText: "private cleaned text",
    monthlyWordsUsed: 2_000,
    planState: "paid_active",
    policy: { monthlyWordsUsed: { watch: 1_000 } },
    prompt: "private prompt",
    token: "Bearer rw_synthetic_placeholder",
    transcript: "private transcript",
  });

  assert.deepEqual(Object.keys(result.metadata).sort(), [
    "evaluated",
    "matchedThresholds",
    "planState",
    "signal",
  ]);
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

async function loadFairUseModule() {
  const source = await readFile(fairUsePath, "utf8");
  const executableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import type \{ RubyWhisperUsagePlanState \} from "\.\/quota";\n\n/,
      "",
    );
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: fairUsePath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
