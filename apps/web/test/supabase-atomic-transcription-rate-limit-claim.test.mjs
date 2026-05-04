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
const rateLimitPath = path.join(
  webRoot,
  "src",
  "lib",
  "rate-limit",
  "transcription.ts",
);
const persistentRateLimitPath = path.join(
  webRoot,
  "src",
  "lib",
  "rate-limit",
  "supabase-transcription-rate-limits.ts",
);
const atomicClaimMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260504101500_claim_transcription_rate_limit.sql",
);

const now = "2026-05-04T12:00:30.000Z";
const windowStart = "2026-05-04T12:00:00.000Z";
const windowEnd = "2026-05-04T12:01:00.000Z";
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private dictionary|private prompt|provider payload|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("atomic transcription rate-limit claim calls the service-role RPC for allowed missing rows", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { calls, client } = createClaimClient({
    row: {
      limit: 20,
      request_count: 1,
      retry_after_seconds: null,
      status: "allowed",
      window_end: "2026-05-04T12:01:30.000Z",
      window_start: now,
    },
  });

  const result = await helper.claimRubyWhisperTranscriptionRateLimit(
    {
      clerkUserId: " user_rw_synthetic_001 ",
      now,
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "claimed",
    metadata: {
      limit: 20,
      requestCount: 1,
      windowEnd: "2026-05-04T12:01:30.000Z",
      windowStart: now,
    },
    ok: true,
    status: "allowed",
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      args: {
        p_clerk_user_id: "user_rw_synthetic_001",
        p_limit: 20,
        p_now: now,
        p_window_seconds: 60,
      },
      functionName: "claim_transcription_rate_limit",
      operation: "rpc",
    },
    { operation: "maybeSingle" },
  ]);
  assert.equal(JSON.stringify(result).includes("user_rw_synthetic_001"), false);
});

test("atomic transcription rate-limit claim maps active allowed windows at the limit", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { client } = createClaimClient({
    row: {
      limit: 20,
      request_count: 20,
      retry_after_seconds: null,
      status: "allowed",
      window_end: windowEnd,
      window_start: windowStart,
    },
  });

  const result = await helper.claimRubyWhisperTranscriptionRateLimit(
    { clerkUserId: "user_rw_synthetic_001", now },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "claimed",
    metadata: {
      limit: 20,
      requestCount: 20,
      windowEnd,
      windowStart,
    },
    ok: true,
    status: "allowed",
  });
});

test("atomic transcription rate-limit claim maps denied windows without user identifiers", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { client } = createClaimClient({
    row: {
      limit: 20,
      request_count: 20,
      retry_after_seconds: 30,
      status: "rate_limited",
      window_end: windowEnd,
      window_start: windowStart,
    },
  });

  const result = await helper.claimRubyWhisperTranscriptionRateLimit(
    { clerkUserId: "user_rw_synthetic_001", now },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "rate_limited",
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
    status: "rate_limited",
  });
  assert.equal(JSON.stringify(result).includes("user_rw_synthetic_001"), false);
});

test("atomic transcription rate-limit claim maps expired reset rows", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { client } = createClaimClient({
    row: {
      limit: 20,
      request_count: 1,
      retry_after_seconds: null,
      status: "allowed",
      window_end: "2026-05-04T12:02:00.000Z",
      window_start: "2026-05-04T12:01:00.000Z",
    },
  });

  const result = await helper.claimRubyWhisperTranscriptionRateLimit(
    {
      clerkUserId: "user_rw_synthetic_001",
      now: "2026-05-04T12:01:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "claimed",
    metadata: {
      limit: 20,
      requestCount: 1,
      windowEnd: "2026-05-04T12:02:00.000Z",
      windowStart: "2026-05-04T12:01:00.000Z",
    },
    ok: true,
    status: "allowed",
  });
});

test("atomic transcription rate-limit claim normalizes policy overrides before RPC", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { calls, client } = createClaimClient({
    row: {
      limit: 8,
      request_count: 1,
      retry_after_seconds: null,
      status: "allowed",
      window_end: "2026-05-04T12:05:30.000Z",
      window_start: now,
    },
  });

  await helper.claimRubyWhisperTranscriptionRateLimit(
    {
      clerkUserId: "user_rw_synthetic_001",
      now,
      planState: "paid_active",
      policy: {
        limit: 20,
        planOverrides: {
          paid_active: {
            limit: 8,
            windowSeconds: 300,
          },
        },
        windowSeconds: 60,
      },
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(calls[0].args), {
    p_clerk_user_id: "user_rw_synthetic_001",
    p_limit: 8,
    p_now: now,
    p_window_seconds: 300,
  });
});

test("atomic transcription rate-limit claim returns sanitized failures", async () => {
  const helper = await loadPersistentRateLimitHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.claimRubyWhisperTranscriptionRateLimit(
        { clerkUserId: " " },
        () => {
          throw new Error("Client factory must not be called for invalid input.");
        },
      ),
    ),
    {
      error: {
        code: "missing_clerk_user_id",
        message:
          "A Clerk user ID is required for transcription rate-limit metadata.",
      },
      ok: false,
      status: "missing_user",
    },
  );

  const { client: rpcFailureClient } = createClaimClient({
    rpcError: {
      message: "database detail must not echo private audio or private transcript",
    },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.claimRubyWhisperTranscriptionRateLimit(
        { clerkUserId: "user_rw_synthetic_001", now },
        () => rpcFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_transcription_rate_limit_claim_failed",
        message: "Unable to claim transcription rate-limit metadata.",
      },
      ok: false,
      status: "claim_failed",
    },
  );

  const { client: malformedRowClient } = createClaimClient({
    row: {
      limit: 20,
      request_count: -1,
      retry_after_seconds: 30,
      status: "rate_limited",
      window_end: windowEnd,
      window_start: windowStart,
    },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.claimRubyWhisperTranscriptionRateLimit(
        { clerkUserId: "user_rw_synthetic_001", now },
        () => malformedRowClient,
      ),
    ),
    {
      error: {
        code: "supabase_transcription_rate_limit_claim_failed",
        message: "Unable to claim transcription rate-limit metadata.",
      },
      ok: false,
      status: "claim_failed",
    },
  );
});

test("atomic transcription rate-limit SQL serializes claims and caps denied counts", async () => {
  const sql = await readFile(atomicClaimMigrationPath, "utf8");

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.claim_transcription_rate_limit\s*\(/i,
  );
  assert.match(sql, /\bpg_advisory_xact_lock\s*\(/i);
  assert.match(sql, /\bfor\s+update\s*;/i);
  assert.match(sql, /\binsert\s+into\s+public\.transcription_rate_limits\b/i);
  assert.match(
    sql,
    /request_count\s*=\s*v_row\.request_count\s*\+\s*1/i,
  );
  assert.match(sql, /request_count\s*=\s*least\s*\(\s*v_row\.request_count\s*,\s*v_limit\s*\)/i);
  assert.match(
    sql,
    /v_row\.window_start\s*\+\s*make_interval\s*\(\s*secs\s*=>\s*v_window_seconds\s*\)\s*<=\s*v_now/i,
  );
  assert.match(sql, /\bv_status\s*:=\s*'rate_limited'/i);
  assert.match(sql, /\bretry_after_seconds\b/i);
  assert.doesNotMatch(sql, /\bexecute\s+format\b/i);
});

test("atomic transcription rate-limit RPC returns metadata only and is service-role gated", async () => {
  const sql = await readFile(atomicClaimMigrationPath, "utf8");
  const returnedColumns = extractReturnedColumns(sql);

  assert.deepEqual(returnedColumns, [
    "status",
    "limit",
    "request_count",
    "retry_after_seconds",
    "window_start",
    "window_end",
  ]);
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.claim_transcription_rate_limit[\s\S]+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.claim_transcription_rate_limit[\s\S]+to\s+service_role\s*;/i,
  );
  assert.doesNotMatch(JSON.stringify(returnedColumns), forbiddenPrivateFixturePattern);
});

test("atomic transcription rate-limit helper remains server-only and content-free", async () => {
  const source = await readFile(persistentRateLimitPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bclaim_transcription_rate_limit\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

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
});

async function loadPersistentRateLimitHelper() {
  const rateLimitPrimitives = await loadRateLimitModule();
  const source = await readFile(persistentRateLimitPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    )
    .replace(
      /import\s+\{\n\s+evaluateRubyWhisperTranscriptionRateLimit,\n\s+type RubyWhisperTranscriptionRateLimitAllowedResult,\n\s+type RubyWhisperTranscriptionRateLimitDeniedResult,\n\s+type RubyWhisperTranscriptionRateLimitInput,\n\s+type RubyWhisperTranscriptionRateLimitMetadata,\n\s+type RubyWhisperTranscriptionRateLimitPolicy,\n\s+type RubyWhisperTranscriptionRateLimitState,\n\}\s+from\s+["']\.\/transcription["'];\n\n/,
      "const { evaluateRubyWhisperTranscriptionRateLimit } = rateLimitPrimitives;\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: persistentRateLimitPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      rateLimitPrimitives,
    },
    {
      filename: persistentRateLimitPath,
    },
  );

  return commonJsModule.exports;
}

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

function createClaimClient({ row = null, rpcError = null } = {}) {
  const calls = [];
  const client = {
    rpc(functionName, args) {
      calls.push({ args, functionName, operation: "rpc" });

      return {
        maybeSingle() {
          calls.push({ operation: "maybeSingle" });

          return Promise.resolve({ data: row, error: rpcError });
        },
      };
    },
  };

  return { calls, client };
}

function extractReturnedColumns(sql) {
  const match = sql.match(/returns\s+table\s*\(([\s\S]+?)\)\s+language/i);

  assert.ok(match, "claim RPC must return a table shape");

  return match[1]
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter(Boolean)
    .map((line) => line.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)?.[1])
    .filter(Boolean);
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
