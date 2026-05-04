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
const groqProviderPath = path.join(
  webRoot,
  "src",
  "lib",
  "providers",
  "groq.ts",
);

test("Groq provider shapes offline transcription requests", async () => {
  const groqProvider = await loadGroqProviderModule();
  const requests = [];
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "test-provider-credential",
    baseUrl: "https://provider.test/openai/v1",
    fetch: async (url, init) => {
      requests.push({ init, url });

      return new Response(
        JSON.stringify({ text: "synthetic normalized text" }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    },
    now: createSyntheticClock(1000, 1042),
  });

  const result = await client.transcribe({
    audio: new Uint8Array([1, 2, 3]),
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
    language: "en",
    requestId: "req_synthetic_offline",
  });

  assert.equal(requests.length, 1);
  assert.equal(
    String(requests[0].url),
    "https://provider.test/openai/v1/audio/transcriptions",
  );
  assert.equal(requests[0].init.method, "POST");
  assert.equal(
    requests[0].init.headers.Authorization,
    "Bearer test-provider-credential",
  );
  assert.ok(requests[0].init.signal instanceof AbortSignal);

  const body = requests[0].init.body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get("model"), "whisper-large-v3-turbo");
  assert.equal(body.get("response_format"), "json");
  assert.equal(body.get("language"), "en");

  const file = body.get("file");
  assert.ok(file instanceof Blob);
  assert.equal(file.size, 3);
  assert.equal(file.type, "audio/wav");

  assert.deepEqual(result, {
    ok: true,
    result: {
      audioDurationMs: 4200,
      provider: "groq",
      providerLatencyMs: 42,
      text: "synthetic normalized text",
    },
  });
});

test("Groq provider returns structured missing config failures", async () => {
  const groqProvider = await loadGroqProviderModule();
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    fetch: async () => {
      throw new Error("fetch should not run without config");
    },
  });

  const failure = await client.transcribe({
    audio: new Uint8Array([1]),
    audioMimeType: "audio/wav",
  });

  assert.deepEqual(failure, {
    ok: false,
    error: {
      apiErrorCode: "service_unavailable",
      code: "missing_config",
      message: "Provider configuration is unavailable.",
      retryable: false,
    },
    metadata: {
      provider: "groq",
    },
  });
});

test("Groq provider normalizes provider and network failures", async () => {
  const groqProvider = await loadGroqProviderModule();

  await assertGroqFailure({
    expected: {
      apiErrorCode: "service_unavailable",
      code: "provider_auth_failed",
      retryable: false,
    },
    fetch: async () => new Response(null, { status: 401 }),
    groqProvider,
  });
  await assertGroqFailure({
    expected: {
      apiErrorCode: "rate_limited",
      code: "provider_rate_limited",
      retryable: true,
    },
    fetch: async () =>
      new Response(null, {
        headers: { "retry-after": "2.5" },
        status: 429,
      }),
    groqProvider,
    metadata: {
      retryAfterSeconds: 2.5,
    },
  });
  await assertGroqFailure({
    expected: {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      retryable: true,
    },
    fetch: async () => new Response(null, { status: 503 }),
    groqProvider,
  });
  await assertGroqFailure({
    expected: {
      apiErrorCode: "network_error",
      code: "network_error",
      retryable: true,
    },
    fetch: async () => {
      throw new TypeError("synthetic network failure");
    },
    groqProvider,
    metadata: {
      totalLatencyMs: 37,
    },
  });
});

test("Groq provider rejects invalid inputs and malformed success responses", async () => {
  const groqProvider = await loadGroqProviderModule();
  const unsupportedModelClient = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "test-provider-credential",
    fetch: async () => {
      throw new Error("fetch should not run for invalid model");
    },
  });
  const malformedResponseClient = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "test-provider-credential",
    baseUrl: "https://provider.test/openai/v1",
    fetch: async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    now: createSyntheticClock(700, 719),
  });

  assert.deepEqual(
    await unsupportedModelClient.transcribe({
      audio: new Uint8Array([1]),
      audioMimeType: "audio/wav",
      model: "unsupported-model",
    }),
    {
      ok: false,
      error: {
        apiErrorCode: "invalid_audio",
        code: "invalid_request",
        message: "Provider request was invalid.",
        retryable: false,
      },
      metadata: {
        provider: "groq",
      },
    },
  );

  assert.deepEqual(
    await malformedResponseClient.transcribe({
      audio: new Blob([new Uint8Array([1, 2])], { type: "audio/webm" }),
      audioDurationMs: 2100,
      audioMimeType: "audio/webm",
    }),
    {
      ok: false,
      error: {
        apiErrorCode: "provider_error",
        code: "provider_invalid_response",
        message: "Provider response was invalid.",
        retryable: true,
      },
      metadata: {
        audioDurationMs: 2100,
        provider: "groq",
        providerLatencyMs: 19,
      },
    },
  );
});

test("Groq provider source stays server-only and metadata-only", async () => {
  const source = await readFile(groqProviderPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /serverEnv\.groq\.apiKey/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);
  assert.doesNotMatch(source, /\.text\s*\(\s*\)|\.arrayBuffer\s*\(\s*\)/);
  assert.doesNotMatch(source, /requestId.*append|append.*requestId/);
});

async function assertGroqFailure({
  expected,
  fetch,
  groqProvider,
  metadata = {},
}) {
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "test-provider-credential",
    baseUrl: "https://provider.test/openai/v1",
    fetch,
    now: createSyntheticClock(100, 137),
  });
  const failure = await client.transcribe({
    audio: new Uint8Array([1]),
    audioDurationMs: 1800,
    audioMimeType: "audio/wav",
  });

  assert.equal(failure.ok, false);
  assert.deepEqual(failure.error, {
    apiErrorCode: expected.apiErrorCode,
    code: expected.code,
    message: expectedMessageForProviderErrorCode(expected.code),
    retryable: expected.retryable,
  });
  assert.deepEqual(failure.metadata, {
    audioDurationMs: 1800,
    provider: "groq",
    ...(expected.code === "network_error"
      ? {}
      : { providerLatencyMs: 37 }),
    ...metadata,
  });
  assert.doesNotMatch(
    JSON.stringify(failure),
    /synthetic network failure|test-provider-credential|Authorization/i,
  );
}

function expectedMessageForProviderErrorCode(code) {
  return {
    network_error: "Provider network request failed.",
    provider_auth_failed: "Provider authentication failed.",
    provider_rate_limited: "Provider rate limit was reached.",
    provider_unavailable: "Provider is unavailable.",
  }[code];
}

function createSyntheticClock(...values) {
  let index = 0;

  return () => values[Math.min(index++, values.length - 1)];
}

async function loadGroqProviderModule() {
  const providerClientModuleUrl = await loadProviderClientModuleUrl();
  const source = await readFile(groqProviderPath, "utf8");
  const executableSource = source
    .replace(/^import\s+["']server-only["'];\n?/, "")
    .replace(
      /import\s+\{\s*serverEnv\s*\}\s+from\s+["']@\/config\/server["'];\n?/,
      "const serverEnv = Object.freeze({ groq: { apiKey: undefined } });\n",
    )
    .replaceAll('from "./client";', `from "${providerClientModuleUrl}";`);

  return importModuleFromSource(executableSource, groqProviderPath);
}

async function loadProviderClientModuleUrl() {
  const source = await readFile(providerClientPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");

  return createModuleUrl(executableSource, providerClientPath);
}

function importModuleFromSource(source, fileName) {
  return import(createModuleUrl(source, fileName));
}

function createModuleUrl(source, fileName) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return `data:text/javascript;base64,${encodedSource}`;
}
