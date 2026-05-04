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
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260504090903_add_transcription_rate_limits.sql",
);

const now = "2026-05-04T12:00:30.000Z";
const windowStart = "2026-05-04T12:00:00.000Z";
const windowEnd = "2026-05-04T12:01:00.000Z";
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private dictionary|private prompt|provider payload|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("persistent transcription rate limit creates an allowed window for missing rows", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { calls, client } = createRateLimitsClient({ row: null });

  const result =
    await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
      {
        clerkUserId: " user_rw_synthetic_001 ",
        now,
      },
      () => client,
    );

  assert.deepEqual(toPlainObject(result), {
    action: "upserted",
    metadata: {
      limit: 20,
      requestCount: 1,
      windowEnd: "2026-05-04T12:01:30.000Z",
      windowStart: now,
    },
    ok: true,
    rateLimit: {
      metadata: {
        limit: 20,
        requestCount: 1,
        windowEnd: "2026-05-04T12:01:30.000Z",
        windowStart: now,
      },
      ok: true,
      state: {
        clerkUserId: "user_rw_synthetic_001",
        requestCount: 1,
        windowStart: now,
      },
      status: "allowed",
    },
    rateLimitRow: {
      clerk_user_id: "user_rw_synthetic_001",
      request_count: 1,
      updated_at: now,
      window_start: now,
    },
    state: {
      clerkUserId: "user_rw_synthetic_001",
      requestCount: 1,
      windowStart: now,
    },
    status: "allowed",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "transcription_rate_limits" },
    {
      columns: "clerk_user_id,request_count,window_start,updated_at",
      operation: "select",
    },
    {
      clerkUserId: "user_rw_synthetic_001",
      columnName: "clerk_user_id",
      operation: "eq",
    },
    { operation: "maybeSingle", phase: "read" },
    { tableName: "transcription_rate_limits" },
    {
      operation: "upsert",
      options: { onConflict: "clerk_user_id" },
      rateLimitRow: {
        clerk_user_id: "user_rw_synthetic_001",
        request_count: 1,
        updated_at: now,
        window_start: now,
      },
    },
    {
      columns: "clerk_user_id,request_count,window_start,updated_at",
      operation: "select_after_upsert",
    },
    { operation: "maybeSingle", phase: "upsert" },
  ]);
});

test("persistent transcription rate limit increments active windows under the limit", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { client } = createRateLimitsClient({
    row: {
      clerk_user_id: "user_rw_synthetic_001",
      request_count: 3,
      updated_at: "2026-05-04T12:00:10.000Z",
      window_start: windowStart,
    },
  });

  const result =
    await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
      {
        clerkUserId: "user_rw_synthetic_001",
        now,
      },
      () => client,
    );

  assert.equal(result.ok, true);
  assert.deepEqual(toPlainObject(result.metadata), {
    limit: 20,
    requestCount: 4,
    windowEnd,
    windowStart,
  });
  assert.deepEqual(toPlainObject(result.rateLimitRow), {
    clerk_user_id: "user_rw_synthetic_001",
    request_count: 4,
    updated_at: now,
    window_start: windowStart,
  });
});

test("persistent transcription rate limit returns rate_limited without writing above the limit", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { calls, client } = createRateLimitsClient({
    row: {
      clerk_user_id: "user_rw_synthetic_001",
      request_count: 20,
      updated_at: "2026-05-04T12:00:10.000Z",
      window_start: windowStart,
    },
  });

  const result =
    await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
      {
        clerkUserId: "user_rw_synthetic_001",
        now,
      },
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
    rateLimit: {
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
    state: {
      clerkUserId: "user_rw_synthetic_001",
      requestCount: 20,
      windowStart,
    },
    status: "rate_limited",
  });
  assert.equal(
    calls.some((call) => call.operation === "upsert"),
    false,
    "rate-limited windows must not persist a count above the policy limit",
  );
});

test("persistent transcription rate limit resets expired windows", async () => {
  const helper = await loadPersistentRateLimitHelper();
  const { client } = createRateLimitsClient({
    row: {
      clerk_user_id: "user_rw_synthetic_001",
      request_count: 20,
      updated_at: "2026-05-04T12:00:10.000Z",
      window_start: windowStart,
    },
  });

  const result =
    await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
      {
        clerkUserId: "user_rw_synthetic_001",
        now: "2026-05-04T12:01:00.000Z",
      },
      () => client,
    );

  assert.equal(result.ok, true);
  assert.deepEqual(toPlainObject(result.rateLimitRow), {
    clerk_user_id: "user_rw_synthetic_001",
    request_count: 1,
    updated_at: "2026-05-04T12:01:00.000Z",
    window_start: "2026-05-04T12:01:00.000Z",
  });
});

test("persistent transcription rate limit returns sanitized failures", async () => {
  const helper = await loadPersistentRateLimitHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
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

  const { client: readFailureClient } = createRateLimitsClient({
    readError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
        { clerkUserId: "user_rw_synthetic_001" },
        () => readFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_transcription_rate_limit_read_failed",
        message: "Unable to read transcription rate-limit metadata.",
      },
      ok: false,
      status: "read_failed",
    },
  );

  const { client: writeFailureClient } = createRateLimitsClient({
    row: null,
    writeError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.evaluateAndPersistRubyWhisperTranscriptionRateLimit(
        {
          clerkUserId: "user_rw_synthetic_001",
          now,
        },
        () => writeFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_transcription_rate_limit_write_failed",
        message: "Unable to write transcription rate-limit metadata.",
      },
      ok: false,
      status: "write_failed",
    },
  );
});

test("persistent transcription rate limit helper remains server-only and content-free", async () => {
  const source = await readFile(persistentRateLimitPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\btranscription_rate_limits\b/);
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

test("transcription rate-limit migration stores only per-user window metadata", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const columns = extractTranscriptionRateLimitColumns(sql);

  assert.deepEqual(columns, [
    "id",
    "clerk_user_id",
    "request_count",
    "window_start",
    "updated_at",
  ]);
  assert.match(
    sql,
    /alter\s+table\s+public\.transcription_rate_limits\s+enable\s+row\s+level\s+security\s*;/i,
  );
  assert.match(sql, /metadata only/i);
  assert.doesNotMatch(JSON.stringify(columns), forbiddenPrivateFixturePattern);
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

function createRateLimitsClient({
  readError = null,
  row = null,
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
        upsert(rateLimitRow, options) {
          calls.push({ operation: "upsert", options, rateLimitRow });

          return {
            select(columns) {
              calls.push({ columns, operation: "select_after_upsert" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "upsert" });

                  return Promise.resolve({
                    data: rateLimitRow,
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

function extractTranscriptionRateLimitColumns(sql) {
  const match = sql.match(
    /create\s+table\s+public\.transcription_rate_limits\s*\(([\s\S]+?)\n\);/i,
  );

  assert.ok(match, "migration must create public.transcription_rate_limits");

  const definitions = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const constraintIndex = definitions.findIndex((line) =>
    line.startsWith("constraint"),
  );

  return definitions
    .slice(0, constraintIndex === -1 ? definitions.length : constraintIndex)
    .map((line) => line.match(/^([a-z_][a-z0-9_]*)\b/i)?.[1])
    .filter(Boolean);
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
