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
const rateLimitPath = path.join(
  webRoot,
  "src",
  "lib",
  "rate-limit",
  "transcription.ts",
);
const apiErrorsPath = path.join(webRoot, "src", "lib", "api", "errors.ts");
const now = "2026-05-04T12:00:30.000Z";
const windowStart = "2026-05-04T12:00:00.000Z";
const windowEnd = "2026-05-04T12:01:00.000Z";
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private dictionary|private prompt|provider payload|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("transcription rate limit allows metadata-only requests under the window limit", async () => {
  const rateLimit = await loadRateLimitModule();

  assert.deepEqual(
    rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
      clerkUserId: " user_rw_synthetic_001 ",
      now,
      requestCount: 3,
      windowStart,
    }),
    {
      metadata: {
        limit: 20,
        requestCount: 4,
        windowEnd,
        windowStart,
      },
      ok: true,
      state: {
        clerkUserId: "user_rw_synthetic_001",
        requestCount: 4,
        windowStart,
      },
      status: "allowed",
    },
  );
});

test("transcription rate limit returns rate_limited metadata at the window limit", async () => {
  const rateLimit = await loadRateLimitModule();

  assert.deepEqual(
    rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
      clerkUserId: "user_rw_synthetic_001",
      now,
      requestCount: 20,
      windowStart,
    }),
    {
      apiErrorMetadata: {
        limit: 20,
        requestCount: 20,
        retryAfterSeconds: 30,
        windowEnd,
        windowStart,
      },
      errorCode: "rate_limited",
      metadata: {
        limit: 20,
        requestCount: 20,
        retryAfterSeconds: 30,
        windowEnd,
        windowStart,
      },
      ok: false,
      state: {
        clerkUserId: "user_rw_synthetic_001",
        requestCount: 20,
        windowStart,
      },
      status: "rate_limited",
    },
  );
});

test("transcription rate limit treats a missing Clerk user as invalid", async () => {
  const rateLimit = await loadRateLimitModule();

  for (const clerkUserId of [undefined, null, "", "   "]) {
    assert.deepEqual(
      rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
        clerkUserId,
        now,
        requestCount: 20,
        windowStart,
      }),
      {
        errorCode: "signed_out",
        ok: false,
        status: "invalid_user",
      },
    );
  }
});

test("transcription rate limit resets expired windows before counting", async () => {
  const rateLimit = await loadRateLimitModule();

  assert.deepEqual(
    rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
      clerkUserId: "user_rw_synthetic_001",
      now: "2026-05-04T12:01:00.000Z",
      requestCount: 20,
      windowStart,
    }),
    {
      metadata: {
        limit: 20,
        requestCount: 1,
        windowEnd: "2026-05-04T12:02:00.000Z",
        windowStart: "2026-05-04T12:01:00.000Z",
      },
      ok: true,
      state: {
        clerkUserId: "user_rw_synthetic_001",
        requestCount: 1,
        windowStart: "2026-05-04T12:01:00.000Z",
      },
      status: "allowed",
    },
  );
});

test("transcription rate limit calculates retry-after from the active window", async () => {
  const rateLimit = await loadRateLimitModule();

  assert.equal(
    rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
      clerkUserId: "user_rw_synthetic_001",
      now: "2026-05-04T12:00:59.200Z",
      policy: { limit: 2, windowSeconds: 60 },
      requestCount: 2,
      windowStart,
    }).metadata.retryAfterSeconds,
    1,
  );

  assert.equal(
    rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
      clerkUserId: "user_rw_synthetic_001",
      now: "2026-05-04T12:00:05.000Z",
      policy: { limit: 2, windowSeconds: 60 },
      requestCount: 2,
      windowStart,
    }).metadata.retryAfterSeconds,
    55,
  );
});

test("transcription rate limit supports typed plan overrides", async () => {
  const rateLimit = await loadRateLimitModule();

  const result = rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
    clerkUserId: "user_rw_synthetic_001",
    now,
    planState: "paid_active",
    policy: {
      limit: 20,
      planOverrides: {
        paid_active: {
          limit: 40,
          windowSeconds: 120,
        },
      },
      windowSeconds: 60,
    },
    requestCount: 20,
    windowStart,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.metadata, {
    limit: 40,
    requestCount: 21,
    windowEnd: "2026-05-04T12:02:00.000Z",
    windowStart,
  });
});

test("transcription rate limit metadata is compatible with rate_limited API errors", async () => {
  const [rateLimit, apiErrors] = await Promise.all([
    loadRateLimitModule(),
    loadApiErrorsModule(),
  ]);
  const result = rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
    clerkUserId: "user_rw_synthetic_001",
    now,
    requestCount: 20,
    windowStart,
  });
  const payload = apiErrors.createRubyWhisperApiErrorPayload(result.errorCode, {
    metadata: {
      ...result.apiErrorMetadata,
      cleanedText: "private cleaned text",
      localHistory: "private context",
      providerRequestBody: "provider payload",
    },
    requestId: "req_rw_synthetic_429",
  });

  assert.deepEqual(payload.metadata, {
    limit: 20,
    requestCount: 20,
    retryAfterSeconds: 30,
    windowEnd,
    windowStart,
  });
  assert.doesNotMatch(JSON.stringify(payload), forbiddenPrivateFixturePattern);
});

test("transcription rate limit primitive remains server-only and metadata-only", async () => {
  const source = await readFile(rateLimitPath, "utf8");
  const rateLimit = await loadRateLimitModule();

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

  const result = rateLimit.evaluateRubyWhisperTranscriptionRateLimit({
    clerkUserId: "user_rw_synthetic_001",
    now,
    requestCount: 20,
    windowStart,
  });

  assert.deepEqual(Object.keys(result.metadata).sort(), [
    "limit",
    "requestCount",
    "retryAfterSeconds",
    "windowEnd",
    "windowStart",
  ]);
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

async function loadRateLimitModule() {
  const source = await readFile(rateLimitPath, "utf8");
  const executableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import type \{ RubyWhisperApiErrorMetadata \} from "\@\/lib\/api\/errors";\n/,
      "",
    )
    .replace(
      /import type \{ RubyWhisperUsagePlanState \} from "\@\/lib\/usage\/quota";\n\n/,
      "",
    );
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: rateLimitPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}

async function loadApiErrorsModule() {
  const source = await readFile(apiErrorsPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: apiErrorsPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
