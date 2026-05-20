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
const providerClientPath = path.join(
  webRoot,
  "src",
  "lib",
  "providers",
  "client.ts",
);

const expectedProviderErrorCodes = [
  "invalid_request",
  "missing_config",
  "network_error",
  "provider_auth_failed",
  "provider_invalid_response",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable",
  "unknown_provider_error",
];
const expectedProviderErrorMetadataKeys = [
  "audioDurationMs",
  "provider",
  "providerLatencyMs",
  "retryAfterSeconds",
  "totalLatencyMs",
];
const expectedApiErrorMapping = {
  invalid_request: "invalid_audio",
  missing_config: "service_unavailable",
  network_error: "network_error",
  provider_auth_failed: "service_unavailable",
  provider_invalid_response: "provider_error",
  provider_rate_limited: "rate_limited",
  provider_timeout: "network_error",
  provider_unavailable: "provider_error",
  unknown_provider_error: "provider_error",
};

test("provider contract exposes a stable server error matrix", async () => {
  const providerClient = await loadProviderClientModule();

  assert.deepEqual(
    providerClient.rubyWhisperProviderErrorCodes,
    expectedProviderErrorCodes,
  );
  assert.deepEqual(
    providerClient.rubyWhisperProviderErrorMetadataKeys,
    expectedProviderErrorMetadataKeys,
  );
  assert.deepEqual(providerClient.rubyWhisperProviderNames, [
    "groq",
    "mock_provider",
    "openai_realtime",
  ]);
  assert.deepEqual(providerClient.rubyWhisperProviderOperations, [
    "cleanup",
    "transcription",
  ]);

  for (const code of expectedProviderErrorCodes) {
    const descriptor = providerClient.rubyWhisperProviderErrorDescriptors[code];

    assert.equal(descriptor.code, code);
    assert.equal(descriptor.apiErrorCode, expectedApiErrorMapping[code]);
    assert.equal(typeof descriptor.message, "string");
    assert.ok(descriptor.message.length > 0 && descriptor.message.length <= 80);
    assert.equal(typeof descriptor.retryable, "boolean");
  }
});

test("provider errors sanitize metadata before route mapping", async () => {
  const providerClient = await loadProviderClientModule();
  const failure = providerClient.createRubyWhisperProviderError(
    "provider_rate_limited",
    {
      metadata: {
        Authorization: "Bearer rw_synthetic_placeholder",
        audio: "payload must not echo",
        audioDurationMs: 4200,
        cleanedText: "payload must not echo",
        context: "payload must not echo",
        dictionaryTerms: ["term_placeholder_alpha"],
        providerLatencyMs: 210,
        providerRequestBody: "payload must not echo",
        rawTranscript: "payload must not echo",
        retryAfterSeconds: 2.2,
        token: "payload must not echo",
        totalLatencyMs: 320,
        transcript: "payload must not echo",
      },
      provider: "mock_provider",
    },
  );

  assert.deepEqual(failure, {
    ok: false,
    error: {
      apiErrorCode: "rate_limited",
      code: "provider_rate_limited",
      message: "Provider rate limit was reached.",
      retryable: true,
    },
    metadata: {
      audioDurationMs: 4200,
      provider: "mock_provider",
      providerLatencyMs: 210,
      retryAfterSeconds: 2.2,
      totalLatencyMs: 320,
    },
  });
  assert.doesNotMatch(
    JSON.stringify(failure),
    /payload must not echo|Bearer|term_placeholder_alpha/,
  );
});

test("mock provider client supports synthetic transcription and cleanup", async () => {
  const providerClient = await loadProviderClientModule();
  const mockClient = providerClient.createRubyWhisperMockProviderClient({
    cleanup(input) {
      assert.equal(input.cleanupEnabled, true);
      assert.equal(input.transcriptText, "synthetic transcript");

      return providerClient.createRubyWhisperProviderSuccess({
        cleanedText: "Synthetic transcript.",
        provider: "mock_provider",
        providerLatencyMs: 18,
      });
    },
    async transcribe(input) {
      assert.equal(input.audioMimeType, "audio/wav");
      assert.equal(input.audioDurationMs, 4200);

      return providerClient.createRubyWhisperProviderSuccess({
        audioDurationMs: input.audioDurationMs,
        provider: "mock_provider",
        providerLatencyMs: 24,
        text: "synthetic transcript",
      });
    },
  });

  const transcriptionResult = await mockClient.transcribe({
    audio: new Uint8Array([1, 2, 3]),
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
    requestId: "req_rw_synthetic_provider_001",
  });
  const cleanupResult = await mockClient.cleanup({
    cleanupEnabled: true,
    transcriptText: "synthetic transcript",
  });

  assert.deepEqual(transcriptionResult, {
    ok: true,
    result: {
      audioDurationMs: 4200,
      provider: "mock_provider",
      providerLatencyMs: 24,
      text: "synthetic transcript",
    },
  });
  assert.deepEqual(cleanupResult, {
    ok: true,
    result: {
      cleanedText: "Synthetic transcript.",
      provider: "mock_provider",
      providerLatencyMs: 18,
    },
  });
});

test("mock provider client fails closed without handlers", async () => {
  const providerClient = await loadProviderClientModule();
  const mockClient = providerClient.createRubyWhisperMockProviderClient();

  const failure = await mockClient.transcribe({
    audio: new Uint8Array([1]),
    audioMimeType: "audio/wav",
  });

  assert.deepEqual(failure, {
    ok: false,
    error: {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      message: "Provider is unavailable.",
      retryable: true,
    },
    metadata: {
      provider: "mock_provider",
    },
  });
});

test("provider contract is server-only and config-free", async () => {
  const source = await readFile(providerClientPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /GROQ_API_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DESKTOP_TOKEN_SECRET|STRIPE_SECRET_KEY/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);
});

async function loadProviderClientModule() {
  const source = await readFile(providerClientPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: providerClientPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
