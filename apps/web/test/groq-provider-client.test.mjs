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
const syntheticEndpoint = "https://groq-provider.test/audio/transcriptions";

test("Groq transcription client shapes multipart requests without live credentials", async () => {
  const groqProvider = await loadGroqProviderModule();
  const fetchCalls = [];
  const nowMs = createClock([1000, 1123]);
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "rw_synthetic_groq_key",
    endpoint: syntheticEndpoint,
    fetch: async (url, init) => {
      fetchCalls.push({ init, url });

      return jsonResponse({ text: "synthetic transcript" }, 200);
    },
    nowMs,
  });

  const result = await client.transcribe({
    audio: new Uint8Array([1, 2, 3]),
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
    language: "en",
    requestId: "req_rw_synthetic_groq_001",
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(String(fetchCalls[0].url), syntheticEndpoint);
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.equal(fetchCalls[0].init.headers.Accept, "application/json");
  assert.equal(
    fetchCalls[0].init.headers.Authorization,
    "Bearer rw_synthetic_groq_key",
  );
  assert.ok(fetchCalls[0].init.body instanceof FormData);

  const body = fetchCalls[0].init.body;

  assert.equal(body.get("model"), "whisper-large-v3-turbo");
  assert.equal(body.get("response_format"), "json");
  assert.equal(body.get("language"), "en");
  assert.equal(body.get("file").name, "rubywhisper-audio.wav");
  assert.equal(body.get("file").type, "audio/wav");
  assert.equal(body.get("file").size, 3);
  assert.deepEqual(result, {
    ok: true,
    result: {
      audioDurationMs: 4200,
      provider: "groq",
      providerLatencyMs: 123,
      text: "synthetic transcript",
    },
  });
});

test("Groq transcription client gives sanitized uploads a provider-readable extension", async () => {
  const groqProvider = await loadGroqProviderModule();
  const fetchCalls = [];
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "rw_synthetic_groq_key",
    endpoint: syntheticEndpoint,
    fetch: async (url, init) => {
      fetchCalls.push({ init, url });

      return jsonResponse({ text: "synthetic transcript" }, 200);
    },
  });

  await client.transcribe({
    audio: new Uint8Array([1, 2, 3]),
    audioDurationMs: 4200,
    audioMimeType: "audio/webm; codecs=opus",
    requestId: "req_rw_synthetic_groq_002",
  });

  const body = fetchCalls[0].init.body;

  assert.equal(body.get("file").name, "rubywhisper-audio.webm");
  assert.equal(body.get("file").type, "audio/webm; codecs=opus");
  assert.doesNotMatch(body.get("file").name, /recording|user|session|token/i);
});

test("Groq transcription client returns missing_config without fetching", async () => {
  const groqProvider = await loadGroqProviderModule();
  let fetchCalls = 0;
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "   ",
    endpoint: syntheticEndpoint,
    fetch: async () => {
      fetchCalls += 1;

      return jsonResponse({ text: "must not call" }, 200);
    },
  });

  const result = await client.transcribe({
    audio: new Uint8Array([1]),
    audioDurationMs: 1000,
    audioMimeType: "audio/wav",
  });

  assert.equal(fetchCalls, 0);
  assert.deepEqual(result, {
    ok: false,
    error: {
      apiErrorCode: "service_unavailable",
      code: "missing_config",
      message: "Provider configuration is unavailable.",
      retryable: false,
    },
    metadata: {
      audioDurationMs: 1000,
      provider: "groq",
    },
  });
});

test("Groq transcription client normalizes rate limits and invalid responses", async () => {
  const groqProvider = await loadGroqProviderModule();
  const rateLimitedClient = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "rw_synthetic_groq_key",
    endpoint: syntheticEndpoint,
    fetch: async () =>
      jsonResponse({ error: "payload must not echo" }, 429, {
        "Retry-After": "2.5",
      }),
    nowMs: createClock([10, 42]),
  });
  const invalidResponseClient = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "rw_synthetic_groq_key",
    endpoint: syntheticEndpoint,
    fetch: async () => jsonResponse({ text: "" }, 200),
    nowMs: createClock([20, 29]),
  });

  const rateLimitedResult = await rateLimitedClient.transcribe({
    audio: new Uint8Array([1]),
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
  });
  const invalidResponseResult = await invalidResponseClient.transcribe({
    audio: new Uint8Array([1]),
    audioMimeType: "audio/wav",
  });

  assert.deepEqual(rateLimitedResult, {
    ok: false,
    error: {
      apiErrorCode: "rate_limited",
      code: "provider_rate_limited",
      message: "Provider rate limit was reached.",
      retryable: true,
    },
    metadata: {
      audioDurationMs: 4200,
      provider: "groq",
      providerLatencyMs: 32,
      retryAfterSeconds: 2.5,
      totalLatencyMs: 32,
    },
  });
  assert.deepEqual(invalidResponseResult, {
    ok: false,
    error: {
      apiErrorCode: "provider_error",
      code: "provider_invalid_response",
      message: "Provider response was invalid.",
      retryable: true,
    },
    metadata: {
      provider: "groq",
      providerLatencyMs: 9,
      totalLatencyMs: 9,
    },
  });
  assert.doesNotMatch(
    JSON.stringify(rateLimitedResult),
    /payload must not echo|Bearer|rw_synthetic_groq_key/,
  );
});

test("Groq transcription client normalizes network and cleanup shell failures", async () => {
  const groqProvider = await loadGroqProviderModule();
  const client = groqProvider.createRubyWhisperGroqProviderClient({
    apiKey: "rw_synthetic_groq_key",
    endpoint: syntheticEndpoint,
    fetch: async () => {
      throw new TypeError("synthetic network failure");
    },
    nowMs: createClock([200, 260]),
  });

  const transcriptionResult = await client.transcribe({
    audio: new Uint8Array([1]),
    audioMimeType: "audio/wav",
  });
  const cleanupResult = await client.cleanup({
    cleanupEnabled: true,
    transcriptText: "synthetic transcript",
  });

  assert.deepEqual(transcriptionResult, {
    ok: false,
    error: {
      apiErrorCode: "network_error",
      code: "network_error",
      message: "Provider network request failed.",
      retryable: true,
    },
    metadata: {
      provider: "groq",
      providerLatencyMs: 60,
      totalLatencyMs: 60,
    },
  });
  assert.deepEqual(cleanupResult, {
    ok: false,
    error: {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      message: "Provider is unavailable.",
      retryable: true,
    },
    metadata: {
      provider: "groq",
    },
  });
});

test("Groq provider shell remains server-only and avoids private serialization", async () => {
  const source = await readFile(groqProviderPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /serverEnv\.groq\.apiKey/);
  assert.match(source, /whisper-large-v3-turbo/);
  assert.match(source, /audio\/transcriptions/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);
  assert.doesNotMatch(source, /providerRequestBody|providerResponseBody/);
});

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    status,
  });
}

function createClock(values) {
  const queue = [...values];

  return () => queue.shift() ?? values.at(-1) ?? 0;
}

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

async function loadGroqProviderModule() {
  globalThis.__rubyWhisperProviderClient = await loadProviderClientModule();
  globalThis.__rubyWhisperServerEnv = { groq: { apiKey: undefined } };

  const source = await readFile(groqProviderPath, "utf8");
  const executableSource = source
    .replace(/^import\s+["']server-only["'];\n?/, "")
    .replace(
      'import { serverEnv } from "@/config/server";',
      "const serverEnv = globalThis.__rubyWhisperServerEnv;",
    )
    .replace(
      [
        'import {',
        '  createRubyWhisperProviderError,',
        '  createRubyWhisperProviderSuccess,',
        '} from "@/lib/providers/client";',
      ].join("\n"),
      [
        "const {",
        "  createRubyWhisperProviderError,",
        "  createRubyWhisperProviderSuccess,",
        "} = globalThis.__rubyWhisperProviderClient;",
      ].join("\n"),
    )
    .replace(/import type \{[\s\S]*?\} from "\@\/lib\/providers\/client";\n/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: groqProviderPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
