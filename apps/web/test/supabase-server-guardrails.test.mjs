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
const serverOnlySupabaseModulePath = path.join(
  srcRoot,
  "lib",
  "supabase",
  "server.ts",
);
const serverOnlyFriendOfRubyBatchModulePath = path.join(
  srcRoot,
  "lib",
  "friend-of-ruby",
  "batches.ts",
);
const forbiddenClientEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const forbiddenClientModuleSpecifiers = [
  "@/lib/friend-of-ruby/batches",
  "@/lib/supabase/server",
  "src/lib/friend-of-ruby/batches",
  "src/lib/supabase/server",
];
const expectedMetadataTableNames = [
  "admin_roles",
  "friend_of_ruby_batches",
  "profiles",
  "stripe_webhook_events",
  "subscriptions",
  "transcription_rate_limits",
  "transcription_requests",
  "usage_counters",
];
const sourceFileExtensions = new Set([".ts", ".tsx"]);

test("Supabase service-role helper stays server-only and explicit", async () => {
  const helper = await readFile(serverOnlySupabaseModulePath, "utf8");

  assert.match(helper, /import\s+["']server-only["'];/);
  assert.match(helper, /from\s+["']@\/config\/server["']/);
  assert.match(helper, /\bSUPABASE_URL\b/);
  assert.match(helper, /\bSUPABASE_SERVICE_ROLE_KEY\b/);
  assert.doesNotMatch(helper, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(helper, /@supabase\/supabase-js/);
});

test("Supabase metadata table guardrails enumerate server-only tables", async () => {
  const helper = await readFile(serverOnlySupabaseModulePath, "utf8");

  for (const tableName of expectedMetadataTableNames) {
    assert.match(helper, new RegExp(`["']${tableName}["']`));
  }

  assert.match(helper, /access:\s*["']server-service-role-only["']/);
  assert.match(helper, /containsPrivateAudioOrTranscriptContent:\s*false/);
});

test("client-facing code cannot import service-role helpers", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isForbiddenServiceRoleImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("public env placeholders do not expose Supabase env", async () => {
  const envExampleFiles = [
    path.join(webRoot, ".env.example"),
    path.join(repoRoot, ".env.example"),
  ];

  for (const filePath of envExampleFiles) {
    const source = await readFile(filePath, "utf8");
    const publicSupabaseNames = source
      .split("\n")
      .filter((line) => /\bNEXT_PUBLIC_.*SUPABASE/.test(line));

    assert.deepEqual(
      publicSupabaseNames,
      [],
      `${path.relative(repoRoot, filePath)} must not define public Supabase env`,
    );
  }
});

test("client config does not reference Supabase server env or helpers", async () => {
  const clientConfigPath = path.join(srcRoot, "config", "client.ts");
  const clientConfig = await readFile(clientConfigPath, "utf8");

  for (const envName of forbiddenClientEnvNames) {
    assert.doesNotMatch(
      clientConfig,
      new RegExp(`\\b${envName}\\b`),
      `src/config/client.ts must not reference ${envName}`,
    );
  }

  for (const moduleSpecifier of forbiddenClientModuleSpecifiers) {
    assert.doesNotMatch(
      clientConfig,
      new RegExp(escapeRegExp(moduleSpecifier)),
      `src/config/client.ts must not reference ${moduleSpecifier}`,
    );
  }
});

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }

      if (entry.isFile() && sourceFileExtensions.has(path.extname(entry.name))) {
        return [entryPath];
      }

      return [];
    }),
  );

  return filePaths.flat();
}

function isClientFacingSource(filePath, source) {
  const relativePath = normalizePath(path.relative(srcRoot, filePath));

  if (relativePath === "config/client.ts") {
    return true;
  }

  if (/^["']use client["'];/.test(source.trimStart())) {
    return true;
  }

  return (
    relativePath.startsWith("app/") &&
    !relativePath.startsWith("app/api/") &&
    /(?:page|layout|loading|error|not-found)\.tsx?$/.test(relativePath)
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

function isForbiddenServiceRoleImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/supabase/server" ||
    moduleSpecifier === "@/lib/friend-of-ruby/batches" ||
    resolvedPath === serverOnlySupabaseModulePath ||
    resolvedPath === serverOnlyFriendOfRubyBatchModulePath
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

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
