import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { syntheticBackendFixtures } from "./support/synthetic-backend-fixtures.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const migrationsRoot = path.join(repoRoot, "supabase", "migrations");
const sourceFileExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const usageQuotaHelpers = [
  {
    moduleSpecifier: "@/lib/usage/quota",
    path: path.join(srcRoot, "lib", "usage", "quota.ts"),
  },
  {
    moduleSpecifier: "@/lib/usage/quota-service",
    path: path.join(srcRoot, "lib", "usage", "quota-service.ts"),
  },
  {
    moduleSpecifier: "@/lib/usage/supabase-usage-counters",
    path: path.join(srcRoot, "lib", "usage", "supabase-usage-counters.ts"),
  },
  {
    moduleSpecifier: "@/lib/usage/supabase-transcription-requests",
    path: path.join(srcRoot, "lib", "usage", "supabase-transcription-requests.ts"),
  },
  {
    moduleSpecifier: "@/lib/supabase/server",
    path: path.join(srcRoot, "lib", "supabase", "server.ts"),
  },
];
const allowedUsageCounterColumns = [
  "clerk_user_id",
  "id",
  "lifetime_words_used",
  "monthly_period_start",
  "monthly_words_used",
  "trial_words_used",
  "updated_at",
];
const forbiddenPrivateContentPatterns = [
  /\baudio(?:_|-)?(?:blob|content|data|file|payload|recording|url)?\b/i,
  /\braw(?:_|-)?transcript\b/i,
  /\btranscript(?:_|-)?(?:content|text|value)?\b/i,
  /\bcleaned(?:_|-)?(?:text|transcript)\b/i,
  /\bclipboard(?:_|-)?(?:content|text|value)?\b/i,
  /\bapp(?:_|-)?context\b/i,
  /\bcontext(?:_|-)?(?:content|snapshot|text|value)?\b/i,
  /\bdictionary(?:_|-)?(?:content|terms|value)?\b/i,
  /\bprompt(?:_|-)?(?:body|content|text|value)?\b/i,
  /\bprovider(?:_|-)?(?:request|response)(?:_|-)?body\b/i,
  /\brequest(?:_|-)?body\b/i,
  /\bresponse(?:_|-)?body\b/i,
];
const forbiddenLoggingPatterns = [
  /\bconsole\.(?:debug|error|info|log|warn)\s*\(/,
  /\b(?:logger|log)\.(?:debug|error|fatal|info|trace|warn)\s*\(/i,
  /\b(?:captureException|captureMessage|Sentry\.(?:captureException|captureMessage))\s*\(/,
  /\bJSON\.stringify\s*\([^)]*\b(?:audio|body|cleanedText|clipboard|context|payload|prompt|provider|request|response|transcript)\b[^)]*\)/ims,
];
const liveOrPrivateFixturePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{20,}\b/,
  /\bwhsec_[A-Za-z0-9_-]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /\.env\.local|rubywhisper\.env/i,
  /https?:\/\/[^\s"'`]*(?:api\.groq\.com|api\.stripe\.com|clerk|supabase)[^\s"'`]*/i,
];

test("usage and quota helpers remain server-only metadata helpers", async () => {
  const violations = [];

  for (const helper of usageQuotaHelpers) {
    const source = await readFile(helper.path, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, helper.path));

    if (!/^import\s+["']server-only["'];/m.test(source)) {
      violations.push(`${relativePath} is not marked server-only`);
    }

    if (/^["']use client["'];/m.test(source.trimStart())) {
      violations.push(`${relativePath} is client-marked`);
    }

    if (/\bNEXT_PUBLIC_/.test(source)) {
      violations.push(`${relativePath} reads client-exposed env`);
    }

    for (const pattern of forbiddenPrivateContentPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} references private content pattern ${pattern}`);
      }
    }

    for (const pattern of forbiddenLoggingPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} logs or stringifies sensitive material`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("browser-bound source cannot import usage quota server helpers", async () => {
  const violations = [];

  for (const filePath of await listFiles(srcRoot, sourceFileExtensions)) {
    const source = await readFile(filePath, "utf8");

    if (!isBrowserBoundSource(source)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(webRoot, filePath));
    const moduleSpecifiers = extractModuleSpecifiers(source);

    for (const helper of usageQuotaHelpers) {
      if (moduleSpecifiers.some((specifier) => importsHelper(filePath, specifier, helper))) {
        violations.push(`${relativePath} imports ${helper.moduleSpecifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("usage_counters migration stays numeric metadata only", async () => {
  const sql = await readMigrationSql();
  const columns = extractPublicTableColumns(sql, "usage_counters").sort();

  assert.deepEqual(columns, allowedUsageCounterColumns);

  for (const column of columns) {
    for (const pattern of forbiddenPrivateContentPatterns) {
      assert.doesNotMatch(
        column,
        pattern,
        `usage_counters.${column} must not store private content`,
      );
    }
  }
});

test("synthetic usage fixtures expose counters and request metadata only", () => {
  const usageFixtureSurfaces = [
    syntheticBackendFixtures.supabase.profile,
    syntheticBackendFixtures.supabase.requestMetadata,
    syntheticBackendFixtures.provider.successMetadata,
    syntheticBackendFixtures.provider.failureMetadata,
  ];
  const fixtureStrings = usageFixtureSurfaces.flatMap(collectStrings);
  const fixtureKeys = usageFixtureSurfaces.flatMap(collectKeys);

  for (const key of fixtureKeys) {
    for (const pattern of forbiddenPrivateContentPatterns) {
      assert.doesNotMatch(key, pattern, `fixture key ${key} must be metadata-only`);
    }
  }

  for (const value of fixtureStrings) {
    for (const pattern of liveOrPrivateFixturePatterns) {
      assert.doesNotMatch(
        value,
        pattern,
        `fixture value ${value} must stay synthetic and local`,
      );
    }
  }
});

async function readMigrationSql() {
  const fileNames = (await readdir(migrationsRoot))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const sqlParts = await Promise.all(
    fileNames.map((fileName) => readFile(path.join(migrationsRoot, fileName), "utf8")),
  );

  return sqlParts.join("\n\n");
}

function extractPublicTableColumns(sql, tableName) {
  const tableRegex = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\."?${tableName}"?\\s*\\(`,
    "i",
  );
  const match = tableRegex.exec(sql);

  assert.ok(match, `public.${tableName} migration must exist`);

  const bodyStart = match.index + match[0].length;
  const bodyEnd = findMatchingParen(sql, bodyStart - 1);
  const tableBody = sql.slice(bodyStart, bodyEnd);

  return splitTopLevelComma(tableBody)
    .map((definition) => definition.trim())
    .filter(Boolean)
    .map((definition) => definition.match(/^"([^"]+)"|^([a-z_][a-z0-9_]*)/i))
    .filter(Boolean)
    .map((matchResult) => (matchResult[1] ?? matchResult[2]).toLowerCase())
    .filter((name) => !["check", "constraint", "primary", "unique"].includes(name));
}

function splitTopLevelComma(value) {
  const parts = [];
  let current = "";
  let depth = 0;
  let isSingleQuoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    current += character;

    if (character === "'" && isSingleQuoted && nextCharacter === "'") {
      current += nextCharacter;
      index += 1;
      continue;
    }

    if (character === "'") {
      isSingleQuoted = !isSingleQuoted;
      continue;
    }

    if (isSingleQuoted) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;
      continue;
    }

    if (character === "," && depth === 0) {
      parts.push(current.slice(0, -1));
      current = "";
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

function findMatchingParen(value, openParenIndex) {
  let depth = 0;
  let isSingleQuoted = false;

  for (let index = openParenIndex; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === "'" && isSingleQuoted && nextCharacter === "'") {
      index += 1;
      continue;
    }

    if (character === "'") {
      isSingleQuoted = !isSingleQuoted;
      continue;
    }

    if (isSingleQuoted) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error("Unable to parse CREATE TABLE statement");
}

async function listFiles(directory, allowedExtensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath, allowedExtensions);
      }

      if (entry.isFile() && allowedExtensions.has(path.extname(entry.name))) {
        return [entryPath];
      }

      return [];
    }),
  );

  return filePaths.flat();
}

function isBrowserBoundSource(source) {
  if (/^["']use client["'];/.test(source.trimStart())) {
    return true;
  }

  return extractModuleSpecifiers(source).some((specifier) =>
    ["@clerk/nextjs", "@clerk/react", "react-dom/client"].includes(specifier),
  );
}

function extractModuleSpecifiers(source) {
  const moduleSpecifiers = [];
  const importExportRegex =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importExportRegex)) {
    moduleSpecifiers.push(match[1]);
  }

  for (const match of source.matchAll(dynamicImportRegex)) {
    moduleSpecifiers.push(match[1]);
  }

  return moduleSpecifiers;
}

function importsHelper(importerPath, moduleSpecifier, helper) {
  return (
    moduleSpecifier === helper.moduleSpecifier ||
    resolveModuleSpecifier(importerPath, moduleSpecifier) === helper.path
  );
}

function resolveModuleSpecifier(importerPath, moduleSpecifier) {
  if (moduleSpecifier.startsWith("@/")) {
    return resolveTypeScriptPath(path.join(srcRoot, moduleSpecifier.slice(2)));
  }

  if (moduleSpecifier.startsWith(".")) {
    return resolveTypeScriptPath(path.resolve(path.dirname(importerPath), moduleSpecifier));
  }

  return moduleSpecifier;
}

function resolveTypeScriptPath(filePath) {
  if (sourceFileExtensions.has(path.extname(filePath))) {
    return filePath;
  }

  return `${filePath}.ts`;
}

function collectStrings(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  return Object.values(value).flatMap(collectStrings);
}

function collectKeys(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }

  return Object.entries(value).flatMap(([key, childValue]) => [
    key,
    ...collectKeys(childValue),
  ]);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
