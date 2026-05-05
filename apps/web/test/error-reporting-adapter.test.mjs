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
const observabilityRoot = path.join(
  webRoot,
  "src",
  "lib",
  "observability",
);
const errorReporterPath = path.join(observabilityRoot, "error-reporter.ts");
const privacyLoggerPath = path.join(observabilityRoot, "privacy-logger.ts");
const forbiddenPayloadPattern =
  /payload must not echo|private audio|private transcript|private cleaned text|private context|private clipboard|private prompt|provider request body|provider response body|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("error reporter exposes provider-neutral metadata-only events", async () => {
  const errorReporter = await loadErrorReporterModule();

  assert.deepEqual(toPlain(errorReporter.rubyWhisperErrorReportEventNames), [
    "backend.error.reported",
    "backend.crash.reported",
  ]);
  assert.ok(errorReporter.rubyWhisperErrorReportMetadataKeys.includes("runtime"));
  assert.ok(errorReporter.rubyWhisperErrorReportMetadataKeys.includes("release"));

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
    "headers",
    "cookie",
    "authorization",
    "token",
    "secret",
  ]) {
    assert.ok(!errorReporter.rubyWhisperErrorReportMetadataKeys.includes(privateKey));
  }
});

test("default error reporter is a no-op sink and returns sanitized metadata", async () => {
  const errorReporter = await loadErrorReporterModule();

  const result = await errorReporter.rubyWhisperNoopErrorReporter.reportError({
    audio: "private audio",
    authorization: "Bearer rw_synthetic_placeholder",
    cleanedText: "private cleaned text",
    cookie: "payload must not echo",
    error: {
      code: "provider_error",
      stack: "payload must not echo",
    },
    errorCode: "provider_error",
    headers: { authorization: "Bearer rw_synthetic_placeholder" },
    metadata: {
      appVersion: "0.1.0-test",
      context: "private context",
      providerRequestBody: "provider request body",
      release: "rw-web-test",
      runtime: "nodejs",
      totalLatencyMs: 420,
    },
    providerResponseBody: "provider response body",
    requestId: "  req_rw_synthetic_error  ",
    route: "/api/desktop/transcribe",
    status: 503,
    transcript: "private transcript",
  });

  assert.deepEqual(toPlain(result), {
    delivered: false,
    report: {
      event: "backend.error.reported",
      metadata: {
        requestId: "req_rw_synthetic_error",
        route: "/api/desktop/transcribe",
        status: 503,
        totalLatencyMs: 420,
        appVersion: "0.1.0-test",
        runtime: "nodejs",
        release: "rw-web-test",
        errorCode: "provider_error",
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(result), forbiddenPayloadPattern);
});

test("configured sink receives only sanitized crash report metadata", async () => {
  const errorReporter = await loadErrorReporterModule();
  const deliveredReports = [];
  const reporter = errorReporter.createRubyWhisperErrorReporter({
    sink(report) {
      deliveredReports.push(report);
    },
  });

  const result = await reporter.reportCrash({
    metadata: {
      appVersion: "0.1.0-test",
      osVersion: "macOS test",
      providerRequestBody: "provider request body",
    },
    release: "rw-web-test",
    requestId: "req_rw_synthetic_crash",
    runtime: "nodejs",
    token: "payload must not echo",
  });

  assert.equal(result.delivered, true);
  assert.deepEqual(toPlain(deliveredReports), [
    {
      event: "backend.crash.reported",
      metadata: {
        requestId: "req_rw_synthetic_crash",
        appVersion: "0.1.0-test",
        osVersion: "macOS test",
        runtime: "nodejs",
        release: "rw-web-test",
      },
    },
  ]);
  assert.deepEqual(toPlain(result.report), toPlain(deliveredReports[0]));
  assert.doesNotMatch(JSON.stringify(deliveredReports), forbiddenPayloadPattern);
});

test("sink failures do not make backend error reporting unsafe", async () => {
  const errorReporter = await loadErrorReporterModule();
  const reporter = errorReporter.createRubyWhisperErrorReporter({
    sink() {
      throw new Error("provider unavailable");
    },
  });

  const result = await reporter.reportError({
    errorCode: "provider_unavailable",
    requestId: "req_rw_synthetic_sink_failure",
  });

  assert.deepEqual(toPlain(result), {
    delivered: false,
    report: {
      event: "backend.error.reported",
      metadata: {
        requestId: "req_rw_synthetic_sink_failure",
        errorCode: "provider_unavailable",
      },
    },
  });
});

test("error reporting adapter remains server-only and provider-neutral", async () => {
  const source = await readFile(errorReporterPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /createRubyWhisperPrivacyLogEvent/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["'](?:@sentry\/[^"']+|pino|winston|next-logger|consola|debug)["']/i);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
});

async function loadErrorReporterModule() {
  const privacyLogger = await loadTypeScriptCommonJsModule(
    privacyLoggerPath,
    createServerOnlyRequire("privacy logger"),
  );

  return loadTypeScriptCommonJsModule(errorReporterPath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "./privacy-logger":
        return privacyLogger;
      default:
        throw new Error(`Unexpected error reporter dependency ${specifier}`);
    }
  });
}

async function loadTypeScriptCommonJsModule(filePath, requireModule) {
  const source = await readFile(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      Buffer,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: requireModule,
    },
    {
      filename: filePath,
    },
  );

  return commonJsModule.exports;
}

function createServerOnlyRequire(moduleName) {
  return function requireServerOnlyModule(specifier) {
    if (specifier === "server-only") {
      return {};
    }

    throw new Error(`Unexpected ${moduleName} dependency ${specifier}`);
  };
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}
