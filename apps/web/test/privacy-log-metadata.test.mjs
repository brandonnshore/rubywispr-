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
const srcRoot = path.join(webRoot, "src");
const privacyLogMetadataPath = path.join(
  webRoot,
  "src",
  "lib",
  "observability",
  "privacy-log-metadata.ts",
);

const expectedPrivacyLogMetadataKeys = [
  "requestId",
  "accountId",
  "userId",
  "planState",
  "durationMs",
  "wordCount",
  "latencyMs",
  "provider",
  "appVersion",
  "osVersion",
  "route",
  "method",
  "status",
  "errorCode",
  "trialWordsRemaining",
  "trialWordsLimit",
  "monthlyWordsRemaining",
  "retryAfterSeconds",
  "durationLimitMs",
  "audioDurationMs",
  "providerLatencyMs",
  "totalLatencyMs",
];
const forbiddenKeys = [
  "audio",
  "authorization",
  "cleanedText",
  "clipboard",
  "context",
  "cookies",
  "dictionaryTerms",
  "headers",
  "localHistory",
  "providerPayload",
  "providerRequestBody",
  "providerResponseBody",
  "rawTranscript",
  "requestBody",
  "secret",
  "sessionToken",
  "transcript",
];
const privateSerializationPattern =
  /synthetic private|Bearer rw_synthetic_placeholder|rw_synthetic_secret|token=rw_synthetic/i;
const sourceFileExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

test("privacy log metadata helper is server-only and side-effect free", async () => {
  const source = await readFile(privacyLogMetadataPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["'](?:node:)?(?:fs|http|https|net)["']/);
  assert.doesNotMatch(source, /from\s+["']next\//);
  assert.doesNotMatch(source, /\bResponse\.json\b|\bprocess\.env\b/);
});

test("privacy log metadata allowlist is explicit and excludes payload fields", async () => {
  const metadata = await loadPrivacyLogMetadataModule();

  assert.deepEqual(
    metadata.rubyWhisperPrivacyLogMetadataKeys,
    expectedPrivacyLogMetadataKeys,
  );

  for (const key of forbiddenKeys) {
    assert.ok(!metadata.rubyWhisperPrivacyLogMetadataKeys.includes(key));
  }
});

test("privacy log metadata sanitizer preserves supported safe metadata", async () => {
  const metadata = await loadPrivacyLogMetadataModule();
  const sanitized = metadata.createRubyWhisperPrivacyLogMetadata({
    accountId: "  acct_rw_synthetic_001  ",
    appVersion: "0.1.0-test",
    audioDurationMs: 42_000,
    durationLimitMs: 600_000,
    durationMs: 42_000,
    errorCode: "provider_error",
    latencyMs: 360,
    method: "post",
    monthlyWordsRemaining: 25_000,
    osVersion: "macOS synthetic 15.0",
    planState: "trial_active",
    provider: "mock_provider",
    providerLatencyMs: 210,
    requestId: "  req_rw_synthetic_001  ",
    retryAfterSeconds: 2.5,
    route: "  /api/desktop/transcribe  ",
    status: 503,
    totalLatencyMs: 390,
    trialWordsLimit: 10_000,
    trialWordsRemaining: 9_500,
    userId: "usr_rw_synthetic_001",
    wordCount: 17,
  });

  assert.deepEqual(sanitized, {
    accountId: "acct_rw_synthetic_001",
    appVersion: "0.1.0-test",
    audioDurationMs: 42_000,
    durationLimitMs: 600_000,
    durationMs: 42_000,
    errorCode: "provider_error",
    latencyMs: 360,
    method: "POST",
    monthlyWordsRemaining: 25_000,
    osVersion: "macOS synthetic 15.0",
    planState: "trial_active",
    provider: "mock_provider",
    providerLatencyMs: 210,
    requestId: "req_rw_synthetic_001",
    retryAfterSeconds: 2.5,
    route: "/api/desktop/transcribe",
    status: 503,
    totalLatencyMs: 390,
    trialWordsLimit: 10_000,
    trialWordsRemaining: 9_500,
    userId: "usr_rw_synthetic_001",
    wordCount: 17,
  });
});

test("privacy log metadata sanitizer drops private payloads and unsafe values", async () => {
  const metadata = await loadPrivacyLogMetadataModule();
  const sanitized = metadata.sanitizeRubyWhisperPrivacyLogMetadata({
    accountId: "acct_rw_synthetic_safe",
    appVersion: { nested: "synthetic private app payload" },
    audio: "synthetic private audio payload",
    cleanedText: "synthetic private cleaned text",
    clipboard: "synthetic private clipboard",
    context: {
      before: "synthetic private context",
      token: "rw_synthetic_secret",
    },
    durationMs: Number.POSITIVE_INFINITY,
    errorCode: "synthetic_private_error_code",
    headers: { authorization: "Bearer rw_synthetic_placeholder" },
    latencyMs: Number.NaN,
    localHistory: ["synthetic private local history"],
    method: "TRACE",
    osVersion: "x".repeat(129),
    provider: "Bearer rw_synthetic_placeholder",
    providerPayload: { transcript: "synthetic private provider payload" },
    rawTranscript: "synthetic private transcript",
    requestBody: { audio: "synthetic private request body" },
    route: "/api/desktop/transcribe?token=rw_synthetic",
    secret: "rw_synthetic_secret",
    status: 99,
    token: "rw_synthetic_secret",
    transcript: "synthetic private transcript",
    userId: ["synthetic private nested user"],
    wordCount: 3.14,
  });
  const serialized = JSON.stringify(sanitized);

  assert.deepEqual(sanitized, {
    accountId: "acct_rw_synthetic_safe",
  });
  assert.doesNotMatch(serialized, privateSerializationPattern);
});

test("privacy log metadata factory returns an empty object when nothing is safe", async () => {
  const metadata = await loadPrivacyLogMetadataModule();

  assert.deepEqual(
    metadata.createRubyWhisperPrivacyLogMetadata({
      audio: "synthetic private audio payload",
      requestId: "Bearer rw_synthetic_placeholder",
      transcript: "synthetic private transcript",
    }),
    {},
  );
});

test("browser-bound source cannot import the server-only privacy log helper", async () => {
  const violations = [];

  for (const filePath of await listFiles(srcRoot, sourceFileExtensions)) {
    const source = await readFile(filePath, "utf8");

    if (!isBrowserBoundSource(source)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(webRoot, filePath));

    for (const specifier of extractModuleSpecifiers(source)) {
      if (
        specifier === "@/lib/observability/privacy-log-metadata" ||
        specifier.endsWith("/lib/observability/privacy-log-metadata") ||
        specifier.endsWith("../observability/privacy-log-metadata") ||
        specifier.endsWith("./privacy-log-metadata")
      ) {
        violations.push(`${relativePath} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function loadPrivacyLogMetadataModule() {
  const source = await readFile(privacyLogMetadataPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: privacyLogMetadataPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}

async function listFiles(root, extensions) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath, extensions)));
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(filePath);
    }
  }

  return files;
}

function extractModuleSpecifiers(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function isBrowserBoundSource(source) {
  return /^\s*["']use client["'];/m.test(source);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
