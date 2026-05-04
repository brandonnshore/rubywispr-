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
const requestMetadataPath = path.join(
  webRoot,
  "src",
  "lib",
  "usage",
  "supabase-transcription-requests.ts",
);

const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private prompt|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("transcription request helper prepares metadata-only success rows", async () => {
  const helper = await loadRequestMetadataHelper();

  const request = helper.prepareTranscriptionRequestMetadata({
    appVersion: " 0.1.0-test ",
    audioDurationMs: 4200.8,
    cleanedWordCount: 3.9,
    clerkUserId: " user_rw_synthetic_member_001 ",
    latencyMs: 24.2,
    now: "2026-05-04T07:30:00.000Z",
    osVersion: " macOS synthetic ",
    planState: "trial_active",
    provider: "mock_provider",
    requestId: " req_rw_synthetic_route_001 ",
    status: "success",
  });

  assert.deepEqual(toPlainObject(request), {
    app_version: "0.1.0-test",
    audio_duration_ms: 4200,
    cleaned_word_count: 3,
    clerk_user_id: "user_rw_synthetic_member_001",
    created_at: "2026-05-04T07:30:00.000Z",
    latency_ms: 24,
    os_version: "macOS synthetic",
    plan_state: "trial_active",
    provider: "mock_provider",
    request_id: "req_rw_synthetic_route_001",
    status: "success",
  });
  assert.deepEqual(Object.keys(request).sort(), [
    "app_version",
    "audio_duration_ms",
    "cleaned_word_count",
    "clerk_user_id",
    "created_at",
    "latency_ms",
    "os_version",
    "plan_state",
    "provider",
    "request_id",
    "status",
  ]);
  assert.doesNotMatch(JSON.stringify(request), forbiddenPrivateFixturePattern);
});

test("transcription request helper writes through service-role Supabase access", async () => {
  const helper = await loadRequestMetadataHelper();
  const { calls, client } = createRequestMetadataClient();

  const result = await helper.writeRubyWhisperTranscriptionRequestMetadata(
    {
      audioDurationMs: 4200,
      cleanedWordCount: 3,
      clerkUserId: "user_rw_synthetic_member_001",
      latencyMs: 24,
      now: "2026-05-04T07:30:00.000Z",
      planState: "trial_active",
      provider: "mock_provider",
      requestId: "req_rw_synthetic_route_001",
      status: "success",
    },
    () => client,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "transcription_requests" },
    {
      operation: "insert",
      requestMetadata: {
        audio_duration_ms: 4200,
        cleaned_word_count: 3,
        clerk_user_id: "user_rw_synthetic_member_001",
        created_at: "2026-05-04T07:30:00.000Z",
        latency_ms: 24,
        plan_state: "trial_active",
        provider: "mock_provider",
        request_id: "req_rw_synthetic_route_001",
        status: "success",
      },
    },
    {
      columns:
        "request_id,clerk_user_id,status,provider,plan_state,audio_duration_ms,cleaned_word_count,latency_ms,error_code,app_version,os_version,created_at",
      operation: "select_after_insert",
    },
    { operation: "maybeSingle", phase: "insert" },
  ]);
});

test("transcription request helper returns sanitized metadata failures", async () => {
  const helper = await loadRequestMetadataHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.writeRubyWhisperTranscriptionRequestMetadata(
        {
          clerkUserId: " ",
          planState: "trial_active",
          provider: "mock_provider",
          requestId: "req_rw_synthetic_route_001",
          status: "success",
        },
        () => {
          throw new Error("Client factory must not be called for invalid input.");
        },
      ),
    ),
    {
      error: {
        code: "missing_transcription_request_metadata",
        message: "Required transcription request metadata is missing.",
      },
      ok: false,
      status: "missing_metadata",
    },
  );

  const { client } = createRequestMetadataClient({
    writeError: { message: "database detail must not echo" },
  });
  const writeFailure =
    await helper.writeRubyWhisperTranscriptionRequestMetadata(
      {
        clerkUserId: "user_rw_synthetic_member_001",
        planState: "trial_active",
        provider: "mock_provider",
        requestId: "req_rw_synthetic_route_001",
        status: "success",
      },
      () => client,
    );

  assert.deepEqual(toPlainObject(writeFailure), {
    error: {
      code: "supabase_transcription_request_write_failed",
      message: "Unable to write transcription request metadata.",
    },
    ok: false,
    status: "write_failed",
  });
});

test("transcription request helper remains server-only and content-free", async () => {
  const source = await readFile(requestMetadataPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\btranscription_requests\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const privateKey of [
    "rawTranscript",
    "cleanedText",
    "context",
    "clipboard",
    "dictionaryTerms",
    "prompt",
    "providerRequestBody",
    "providerResponseBody",
    "authorization",
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${privateKey}\\b`));
  }
});

async function loadRequestMetadataHelper() {
  const quotaPrimitives = await loadUsageQuotaModule();
  const source = await readFile(requestMetadataPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+["']@\/lib\/api\/errors["'];\n/, "")
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+["']@\/lib\/providers\/client["'];\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    )
    .replace(
      /import\s+\{\n\s+normalizeRubyWhisperUsageWordCount,\n\s+type RubyWhisperUsagePlanState,\n\}\s+from\s+["']\.\/quota["'];\n\n/,
      "const { normalizeRubyWhisperUsageWordCount } = quotaPrimitives;\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: requestMetadataPath,
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
      filename: requestMetadataPath,
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

function createRequestMetadataClient({ writeError = null } = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        insert(requestMetadata) {
          calls.push({ operation: "insert", requestMetadata });

          return {
            select(columns) {
              calls.push({ columns, operation: "select_after_insert" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "insert" });

                  return Promise.resolve({
                    data: requestMetadata,
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
