import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const testRoot = path.join(webRoot, "test");
const syntheticBackendFixturesPath = path.join(
  testRoot,
  "support",
  "synthetic-backend-fixtures.mjs",
);
const sourceFileExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const sensitiveSourceRoots = [
  path.join(srcRoot, "app", "(public)", "privacy"),
  path.join(srcRoot, "app", "(public)", "support"),
  path.join(srcRoot, "app", "admin"),
  path.join(srcRoot, "app", "api"),
  path.join(srcRoot, "lib", "account"),
  path.join(srcRoot, "lib", "admin"),
  path.join(srcRoot, "lib", "api"),
  path.join(srcRoot, "lib", "auth"),
  path.join(srcRoot, "lib", "billing"),
  path.join(srcRoot, "lib", "cleanup"),
  path.join(srcRoot, "lib", "desktop-transcribe"),
  path.join(srcRoot, "lib", "friend-of-ruby"),
  path.join(srcRoot, "lib", "observability"),
  path.join(srcRoot, "lib", "providers"),
  path.join(srcRoot, "lib", "rate-limit"),
  path.join(srcRoot, "lib", "supabase"),
  path.join(srcRoot, "lib", "usage"),
  path.join(srcRoot, "proxy.ts"),
];
const approvedPrivacyLoggerPath = path.join(
  srcRoot,
  "lib",
  "observability",
  "privacy-logger.ts",
);
const approvedErrorReporterPath = path.join(
  srcRoot,
  "lib",
  "observability",
  "error-reporter.ts",
);
const approvedCaptureBoundaryPaths = new Set([approvedErrorReporterPath]);
const adHocLoggingPatterns = [
  {
    label: "console logging",
    pattern: /\bconsole\.(?:debug|error|info|log|warn)\s*\(/,
  },
  {
    label: "logger call",
    pattern: /\b(?:logger|log)\.(?:debug|error|fatal|info|trace|warn)\s*\(/i,
  },
  {
    label: "direct error capture",
    pattern: /\b(?:captureException|captureMessage|Sentry\.(?:captureException|captureMessage))\s*\(/,
  },
];
const sensitiveStringificationPattern =
  /\bJSON\.stringify\s*\([^)]*\b(?:authorization|auth|body|cleanedText|clipboard|context|cookie|headers|jwt|payload|prompt|provider|request|response|session|ticket|token|transcript|audio)\b[^)]*\)/ims;
const unapprovedLoggerImportPattern =
  /from\s+["'](?:@sentry\/[^"']+|pino|winston|next-logger|consola|debug)["']/i;
const liveLookingFixturePatterns = [
  {
    label: "JWT-like value",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    label: "secret or publishable key value",
    pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "webhook secret value",
    pattern: /\bwhsec_[A-Za-z0-9_-]{16,}\b/,
  },
  {
    label: "private env source reference",
    pattern: /(?:^|[/\\])(?:\.env\.local|rubywhisper\.env)\b/i,
  },
  {
    label: "live-looking provider payload URL",
    pattern: /https?:\/\/[^\s"'`]*(?:api\.groq\.com|api\.stripe\.com|clerk|supabase)[^\s"'`]*/i,
  },
];
const transientDictionaryPayloadPattern =
  /\bdictionaryTerms\b|\bdictionary_terms\b|term_placeholder_(?:alpha|beta|disabled)\b|\brecentWisprs?\b|\brecent_wisprs?\b|\bfinalText\b|SYNTHETIC_RECENT_WISPR_TEXT/i;

test("sensitive web/backend source cannot add ad hoc logging or private stringification", async () => {
  const violations = [];

  for (const filePath of await listSensitiveSourceFiles()) {
    if (filePath === approvedPrivacyLoggerPath) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, filePath));
    const isApprovedCaptureBoundary = approvedCaptureBoundaryPaths.has(filePath);

    for (const { label, pattern } of adHocLoggingPatterns) {
      if (label === "direct error capture" && isApprovedCaptureBoundary) {
        continue;
      }

      if (pattern.test(source)) {
        violations.push(`${relativePath} contains ${label}`);
      }
    }

    if (sensitiveStringificationPattern.test(source)) {
      violations.push(`${relativePath} stringifies sensitive request material`);
    }

    if (!isApprovedCaptureBoundary && unapprovedLoggerImportPattern.test(source)) {
      violations.push(`${relativePath} imports an unapproved logger or capture SDK`);
    }
  }

  assert.deepEqual(violations, []);
});

test("approved privacy logger remains side-effect free", async () => {
  const source = await readFile(approvedPrivacyLoggerPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /sanitizeRubyWhisperPrivacyLogMetadata/);
  assert.match(source, /createRubyWhisperBackendRequestFailedLogEvent/);
  assert.doesNotMatch(source, transientDictionaryPayloadPattern);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["'](?:@sentry\/[^"']+|pino|winston|next-logger|consola|debug)["']/i);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
});

test("approved error reporting adapter remains provider-neutral", async () => {
  const source = await readFile(approvedErrorReporterPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /createRubyWhisperPrivacyLogEvent/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["'](?:@sentry\/[^"']+|pino|winston|next-logger|consola|debug)["']/i);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
});

test("privacy logging fixtures stay synthetic and local", async () => {
  const violations = [];

  for (const filePath of [syntheticBackendFixturesPath]) {
    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, filePath));

    for (const { label, pattern } of liveLookingFixturePatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} contains ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("durable backend fixtures never store transient dictionary or Recent Wisprs payloads", async () => {
  const source = await readFile(syntheticBackendFixturesPath, "utf8");

  assert.doesNotMatch(source, transientDictionaryPayloadPattern);
});

async function listSensitiveSourceFiles() {
  const files = [];

  for (const root of sensitiveSourceRoots) {
    if (path.extname(root)) {
      files.push(root);
      continue;
    }

    files.push(...(await listFilesIfDirectory(root, sourceFileExtensions)));
  }

  return files;
}

async function listFilesIfDirectory(root, extensions) {
  try {
    return await listFiles(root, extensions);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function listFiles(root, extensions) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath, extensions)));
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
