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
const openAIRealtimeProviderPath = path.join(
  webRoot,
  "src",
  "lib",
  "providers",
  "openai-realtime.ts",
);
const syntheticEndpoint = "https://openai-realtime-provider.test/client_secrets";
const syntheticWebSocketURL = "wss://openai-realtime-provider.test/realtime";

test("OpenAI realtime client-secret request uses transcription-only low-delay audio config", async () => {
  const openAIRealtimeProvider = await loadOpenAIRealtimeProviderModule();
  const fetchCalls = [];
  const nowMs = createClock([1000, 1087]);

  const result = await openAIRealtimeProvider.createRubyWhisperOpenAIRealtimeClientSecret(
    {
      language: "EN",
      requestId: "req_rw_synthetic_realtime_001",
    },
    {
      apiKey: "rw_synthetic_openai_key",
      endpoint: syntheticEndpoint,
      fetch: async (url, init) => {
        fetchCalls.push({ init, url });

        return jsonResponse(
          {
            expires_at: 1779240000,
            value: "ek_synthetic_realtime_client_secret",
          },
          200,
        );
      },
      nowMs,
      webSocketURL: syntheticWebSocketURL,
    },
  );

  assert.equal(fetchCalls.length, 1);
  assert.equal(String(fetchCalls[0].url), syntheticEndpoint);
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.equal(fetchCalls[0].init.headers.Accept, "application/json");
  assert.equal(
    fetchCalls[0].init.headers.Authorization,
    "Bearer rw_synthetic_openai_key",
  );
  assert.equal(fetchCalls[0].init.headers["Content-Type"], "application/json");

  const body = JSON.parse(fetchCalls[0].init.body);

  assert.deepEqual(body, {
    expires_after: {
      anchor: "created_at",
      seconds: 600,
    },
    session: {
      type: "transcription",
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          transcription: {
            model: "gpt-realtime-whisper",
            delay: "minimal",
            language: "en",
          },
          turn_detection: null,
        },
      },
    },
  });
  assert.deepEqual(result, {
    ok: true,
    result: {
      clientSecret: "ek_synthetic_realtime_client_secret",
      expiresAt: 1779240000,
      provider: "openai_realtime",
      providerLatencyMs: 87,
      webSocketURL: syntheticWebSocketURL,
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /rw_synthetic_openai_key/);
});

test("OpenAI realtime client-secret helper fails closed without live credentials", async () => {
  const openAIRealtimeProvider = await loadOpenAIRealtimeProviderModule();
  let fetchCalls = 0;

  const result = await openAIRealtimeProvider.createRubyWhisperOpenAIRealtimeClientSecret(
    {},
    {
      apiKey: "   ",
      endpoint: syntheticEndpoint,
      fetch: async () => {
        fetchCalls += 1;

        return jsonResponse({ value: "must not fetch" }, 200);
      },
    },
  );

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
      provider: "openai_realtime",
    },
  });
});

test("OpenAI realtime provider shell remains server-only and metadata-only on failures", async () => {
  const source = await readFile(openAIRealtimeProviderPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /serverEnv\.openai\.apiKey/);
  assert.match(source, /gpt-realtime-whisper/);
  assert.match(source, /\/v1\/realtime\/client_secrets/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
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

async function loadOpenAIRealtimeProviderModule() {
  globalThis.__rubyWhisperProviderClient = await loadProviderClientModule();
  globalThis.__rubyWhisperServerEnv = { openai: { apiKey: undefined } };

  const source = await readFile(openAIRealtimeProviderPath, "utf8");
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
    fileName: openAIRealtimeProviderPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
