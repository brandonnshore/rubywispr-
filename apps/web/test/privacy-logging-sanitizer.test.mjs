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
const privacyLoggerPath = path.join(
  webRoot,
  "src",
  "lib",
  "observability",
  "privacy-logger.ts",
);

const expectedMetadataKeys = [
  "requestId",
  "route",
  "method",
  "status",
  "accountId",
  "userId",
  "planState",
  "durationMs",
  "audioDurationMs",
  "wordCount",
  "cleanedWordCount",
  "latencyMs",
  "provider",
  "providerLatencyMs",
  "totalLatencyMs",
  "appVersion",
  "osVersion",
  "runtime",
  "release",
  "errorCode",
];
const expectedRequestEventNames = [
  "backend.request.started",
  "backend.request.succeeded",
  "backend.request.failed",
];
const forbiddenPayloadPattern =
  /payload must not echo|private audio|private transcript|private cleaned text|private context|private clipboard|private dictionary|private prompt|provider request body|provider response body|clipboard_text_placeholder_private|previous_clipboard_placeholder_private|local_history_placeholder_private|app_context_placeholder_private|SYNTHETIC_RECENT_WISPR_TEXT|term_placeholder_alpha|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("privacy log metadata exposes an explicit metadata-only allowlist", async () => {
  const privacyLogger = await loadPrivacyLoggerModule();

  assert.deepEqual(
    privacyLogger.rubyWhisperPrivacyLogMetadataKeys,
    expectedMetadataKeys,
  );

  for (const privateKey of [
    "audio",
    "rawTranscript",
    "transcript",
    "cleanedText",
    "context",
    "clipboard",
    "clipboardFallback",
    "clipboardFallbackText",
    "clipboardText",
    "dictionaryTerms",
    "finalText",
    "localHistory",
    "prompt",
    "providerRequestBody",
    "providerResponseBody",
    "previousClipboard",
    "recentWisprs",
    "recentWisprRows",
    "selectedText",
    "windowTitle",
    "headers",
    "cookie",
    "authorization",
    "token",
    "secret",
  ]) {
    assert.ok(!privacyLogger.rubyWhisperPrivacyLogMetadataKeys.includes(privateKey));
  }
});

test("privacy log sanitizer preserves safe metadata and drops private payloads", async () => {
  const privacyLogger = await loadPrivacyLoggerModule();

  const metadata = privacyLogger.sanitizeRubyWhisperPrivacyLogMetadata({
    accountId: "acct_rw_synthetic_001",
    appVersion: "0.1.0-test",
    audio: "private audio",
    audioDurationMs: 42_000,
    authorization: "Bearer rw_synthetic_placeholder",
    cleanedText: "private cleaned text",
    cleanedWordCount: 7,
    clipboard: "private clipboard",
    clipboardFallback: "clipboard_text_placeholder_private",
    clipboardFallbackText: "clipboard_text_placeholder_private",
    clipboardText: "clipboard_text_placeholder_private",
    context: "private context",
    cookie: "session=payload must not echo",
    dictionaryContent: "private dictionary",
    dictionaryTerms: ["term_placeholder_alpha"],
    durationMs: 42_000,
    errorCode: "provider_error",
    headers: { authorization: "Bearer rw_synthetic_placeholder" },
    latencyMs: 320,
    localHistory: "payload must not echo",
    localHistorySnapshot: "local_history_placeholder_private",
    method: "POST",
    osVersion: "macOS test",
    planState: "trial_active",
    prompt: "private prompt",
    previousClipboard: "previous_clipboard_placeholder_private",
    provider: "mock_provider",
    providerLatencyMs: 210,
    providerRequestBody: "provider request body",
    providerResponseBody: "provider response body",
    rawTranscript: "private transcript",
    recentWisprs: "SYNTHETIC_RECENT_WISPR_TEXT",
    recentWisprRows: [{ finalText: "SYNTHETIC_RECENT_WISPR_TEXT" }],
    release: "rw-web-test",
    requestId: "  req_rw_synthetic_001  ",
    route: "/api/desktop/transcribe",
    runtime: "nodejs",
    selectedText: "app_context_placeholder_private",
    status: 503,
    token: "payload must not echo",
    totalLatencyMs: 420,
    transcript: "private transcript",
    userId: "user_rw_synthetic_001",
    windowTitle: "app_context_placeholder_private",
    wordCount: 7,
  });

  assert.deepEqual(metadata, {
    requestId: "req_rw_synthetic_001",
    route: "/api/desktop/transcribe",
    method: "POST",
    status: 503,
    accountId: "acct_rw_synthetic_001",
    userId: "user_rw_synthetic_001",
    planState: "trial_active",
    durationMs: 42_000,
    audioDurationMs: 42_000,
    wordCount: 7,
    cleanedWordCount: 7,
    latencyMs: 320,
    provider: "mock_provider",
    providerLatencyMs: 210,
    totalLatencyMs: 420,
    appVersion: "0.1.0-test",
    osVersion: "macOS test",
    runtime: "nodejs",
    release: "rw-web-test",
    errorCode: "provider_error",
  });
  assert.doesNotMatch(JSON.stringify(metadata), forbiddenPayloadPattern);
});

test("privacy log sanitizer drops unsafe allowed values", async () => {
  const privacyLogger = await loadPrivacyLoggerModule();

  const metadata = privacyLogger.sanitizeRubyWhisperPrivacyLogMetadata({
    accountId: "https://example.test/callback?session=payload_must_not_echo",
    appVersion: "0.1.0-test",
    latencyMs: Number.NaN,
    osVersion: "macOS test",
    provider: "Bearer rw_synthetic_placeholder",
    release: "rw-web-test",
    requestId: "req_rw_synthetic_002",
    route: "/".repeat(129),
    runtime: "nodejs",
    totalLatencyMs: Number.POSITIVE_INFINITY,
    userId: "/Users/example/.config/rubywhisper/rubywhisper.env",
  });

  assert.deepEqual(metadata, {
    requestId: "req_rw_synthetic_002",
    appVersion: "0.1.0-test",
    osVersion: "macOS test",
    runtime: "nodejs",
    release: "rw-web-test",
  });
});

test("privacy log event factory is side-effect free and short", async () => {
  const privacyLogger = await loadPrivacyLoggerModule();

  const event = privacyLogger.createRubyWhisperPrivacyLogEvent(
    "desktop.transcribe.failed",
    {
      metadata: {
        audio: "payload must not echo",
        errorCode: "network_error",
        requestId: "req_rw_synthetic_503",
        route: "/api/desktop/transcribe",
        status: 503,
      },
    },
  );

  assert.deepEqual(event, {
    event: "desktop.transcribe.failed",
    metadata: {
      requestId: "req_rw_synthetic_503",
      route: "/api/desktop/transcribe",
      status: 503,
      errorCode: "network_error",
    },
  });
  assert.ok(Buffer.byteLength(JSON.stringify(event), "utf8") <= 256);
  assert.equal(
    privacyLogger.createRubyWhisperPrivacyLogEvent("Desktop Transcribe Failed"),
    undefined,
  );
});

test("backend request event builders emit metadata-only lifecycle events", async () => {
  const privacyLogger = await loadPrivacyLoggerModule();

  assert.deepEqual(
    privacyLogger.rubyWhisperBackendRequestLogEventNames,
    expectedRequestEventNames,
  );

  const startedEvent =
    privacyLogger.createRubyWhisperBackendRequestStartedLogEvent({
      audio: "payload must not echo",
      body: { rawTranscript: "private transcript" },
      clipboardFallback: "clipboard_text_placeholder_private",
      clipboardText: "clipboard_text_placeholder_private",
      headers: { authorization: "Bearer rw_synthetic_placeholder" },
      localHistory: "local_history_placeholder_private",
      method: "POST",
      metadata: {
        appVersion: "0.1.0-test",
        context: "private context",
        osVersion: "macOS test",
        previousClipboard: "previous_clipboard_placeholder_private",
        providerRequestBody: "provider request body",
        recentWisprs: "SYNTHETIC_RECENT_WISPR_TEXT",
        requestId: "req_rw_synthetic_start",
      },
      route: "/api/desktop/transcribe",
    });

  assert.deepEqual(startedEvent, {
    event: "backend.request.started",
    metadata: {
      requestId: "req_rw_synthetic_start",
      route: "/api/desktop/transcribe",
      method: "POST",
      appVersion: "0.1.0-test",
      osVersion: "macOS test",
    },
  });
  assert.doesNotMatch(JSON.stringify(startedEvent), forbiddenPayloadPattern);

  const succeededEvent =
    privacyLogger.createRubyWhisperBackendRequestSucceededLogEvent({
      cleanedText: "private cleaned text",
      clipboardFallbackText: "clipboard_text_placeholder_private",
      cleanedWordCount: 7,
      finalText: "SYNTHETIC_RECENT_WISPR_TEXT",
      latencyMs: 320,
      metadata: {
        planState: "trial_active",
        totalLatencyMs: 420,
      },
      requestId: "req_rw_synthetic_success",
      status: 200,
      wordCount: 7,
    });

  assert.deepEqual(succeededEvent, {
    event: "backend.request.succeeded",
    metadata: {
      requestId: "req_rw_synthetic_success",
      status: 200,
      planState: "trial_active",
      wordCount: 7,
      cleanedWordCount: 7,
      latencyMs: 320,
      totalLatencyMs: 420,
    },
  });
  assert.doesNotMatch(JSON.stringify(succeededEvent), forbiddenPayloadPattern);
});

test("backend request failed event keeps error code without private error payload", async () => {
  const privacyLogger = await loadPrivacyLoggerModule();

  const failedEvent = privacyLogger.createRubyWhisperBackendRequestFailedLogEvent({
    cookie: "session=payload must not echo",
    error: {
      code: "provider_error",
      providerResponseBody: "provider response body",
      stack: "payload must not echo",
    },
    errorCode: "provider_error",
    metadata: {
      Authorization: "Bearer rw_synthetic_placeholder",
      provider: "mock_provider",
      providerLatencyMs: 210,
      provider_response_body: "provider response body",
      totalLatencyMs: 430,
    },
    providerRequestBody: "provider request body",
    recentWisprRows: [{ finalText: "SYNTHETIC_RECENT_WISPR_TEXT" }],
    requestId: "req_rw_synthetic_failed",
    route: "/api/desktop/transcribe",
    status: 503,
  });

  assert.deepEqual(failedEvent, {
    event: "backend.request.failed",
    metadata: {
      requestId: "req_rw_synthetic_failed",
      route: "/api/desktop/transcribe",
      status: 503,
      provider: "mock_provider",
      providerLatencyMs: 210,
      totalLatencyMs: 430,
      errorCode: "provider_error",
    },
  });
  assert.doesNotMatch(JSON.stringify(failedEvent), forbiddenPayloadPattern);
});

test("privacy log primitive remains server-only and has no log sink", async () => {
  const source = await readFile(privacyLoggerPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["']next\/server["']/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
});

async function loadPrivacyLoggerModule() {
  const source = await readFile(privacyLoggerPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: privacyLoggerPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
