import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const termsAcceptanceModulePath = path.join(
  srcRoot,
  "lib",
  "auth",
  "terms-acceptance.ts",
);
const sourceFileExtensions = new Set([".ts", ".tsx"]);
const forbiddenPrivateMetadataFragments = [
  "audio",
  "cleaned_text",
  "clipboard",
  "consent_text",
  "context",
  "local_history",
  "recording",
  "transcript",
];

test("terms acceptance helper reads accepted metadata", async () => {
  const helper = await loadTermsAcceptanceHelper();
  const calls = [];
  const client = createReadClient(calls, {
    data: {
      clerk_user_id: "user_terms_123",
      terms_accepted_at: "2026-05-04T04:10:00.000Z",
    },
    error: null,
  });

  const result = await helper.readClerkUserTermsAcceptance(
    { clerkUserId: " user_terms_123 " },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    clerkUserId: "user_terms_123",
    ok: true,
    status: "accepted",
    termsAcceptedAt: "2026-05-04T04:10:00.000Z",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "profiles" },
    { columns: "clerk_user_id,terms_accepted_at", operation: "select" },
    { clerkUserId: "user_terms_123", columnName: "clerk_user_id" },
    { operation: "maybeSingle" },
  ]);
});

test("terms acceptance helper returns missing acceptance and profile states", async () => {
  const helper = await loadTermsAcceptanceHelper();

  const missingAcceptance = await helper.readClerkUserTermsAcceptance(
    { clerkUserId: "user_terms_123" },
    () =>
      createReadClient([], {
        data: {
          clerk_user_id: "user_terms_123",
          terms_accepted_at: null,
        },
        error: null,
      }),
  );

  assert.deepEqual(toPlainObject(missingAcceptance), {
    clerkUserId: "user_terms_123",
    error: {
      code: "missing_terms_acceptance",
      message: "Terms acceptance has not been recorded for this profile.",
    },
    ok: false,
    status: "missing_acceptance",
  });

  const missingProfile = await helper.readClerkUserTermsAcceptance(
    { clerkUserId: "user_missing_profile" },
    () => createReadClient([], { data: null, error: null }),
  );

  assert.deepEqual(toPlainObject(missingProfile), {
    clerkUserId: "user_missing_profile",
    error: {
      code: "supabase_profile_missing",
      message: "A Supabase profile is required for Terms acceptance metadata.",
    },
    ok: false,
    status: "missing_profile",
  });
});

test("terms acceptance helper returns missing user without creating a client", async () => {
  const helper = await loadTermsAcceptanceHelper();

  const result = await helper.readClerkUserTermsAcceptance(
    { clerkUserId: " " },
    () => {
      throw new Error("Client factory must not be called for missing user input.");
    },
  );

  assert.deepEqual(toPlainObject(result), {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for Terms acceptance metadata.",
    },
    ok: false,
    status: "missing_user",
  });
});

test("terms acceptance helper records timestamp metadata only", async () => {
  const helper = await loadTermsAcceptanceHelper();
  const calls = [];
  const acceptedAt = "2026-05-04T04:12:00.000Z";
  const client = createWriteClient(calls, {
    data: {
      clerk_user_id: "user_terms_123",
      terms_accepted_at: acceptedAt,
    },
    error: null,
  });

  const result = await helper.recordClerkUserTermsAcceptance(
    {
      acceptedAt,
      clerkUserId: "user_terms_123",
      primaryEmail: "ignored@example.com",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    clerkUserId: "user_terms_123",
    ok: true,
    status: "accepted",
    termsAcceptedAt: acceptedAt,
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "profiles" },
    {
      operation: "update",
      profile: {
        terms_accepted_at: acceptedAt,
      },
    },
    { clerkUserId: "user_terms_123", columnName: "clerk_user_id" },
    { columns: "clerk_user_id,terms_accepted_at", operation: "select" },
    { operation: "maybeSingle" },
  ]);
});

test("terms acceptance helper returns sanitized read and write failures", async () => {
  const helper = await loadTermsAcceptanceHelper();

  const readFailure = await helper.readClerkUserTermsAcceptance(
    { clerkUserId: "user_terms_123" },
    () =>
      createReadClient([], {
        data: null,
        error: { message: "database detail not returned to callers" },
      }),
  );

  assert.deepEqual(toPlainObject(readFailure), {
    clerkUserId: "user_terms_123",
    error: {
      code: "supabase_terms_acceptance_read_failed",
      message: "Unable to read Terms acceptance metadata.",
    },
    ok: false,
    status: "read_failed",
  });

  const writeFailure = await helper.recordClerkUserTermsAcceptance(
    {
      acceptedAt: "2026-05-04T04:12:00.000Z",
      clerkUserId: "user_terms_123",
    },
    () =>
      createWriteClient([], {
        data: null,
        error: { message: "database detail not returned to callers" },
      }),
  );

  assert.deepEqual(toPlainObject(writeFailure), {
    clerkUserId: "user_terms_123",
    error: {
      code: "supabase_terms_acceptance_write_failed",
      message: "Unable to record Terms acceptance metadata.",
    },
    ok: false,
    status: "write_failed",
  });
});

test("terms acceptance helper remains server-only and metadata-only", async () => {
  const source = await readFile(termsAcceptanceModulePath, "utf8");

  assert.match(source, /import\s+["']server-only["'];/);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bterms_accepted_at\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bemail\b|\bprimaryEmail\b/);

  for (const fragment of forbiddenPrivateMetadataFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`, "i"),
      `terms acceptance helper must not reference private content field "${fragment}"`,
    );
  }
});

test("client-facing code cannot import the terms acceptance helper", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isTermsAcceptanceHelperImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

function createReadClient(calls, result) {
  return {
    from(tableName) {
      calls.push({ tableName });

      return {
        select(columns) {
          calls.push({ columns, operation: "select" });

          return {
            eq(columnName, clerkUserId) {
              calls.push({ clerkUserId, columnName });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle" });

                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
}

function createWriteClient(calls, result) {
  return {
    from(tableName) {
      calls.push({ tableName });

      return {
        update(profile) {
          calls.push({ operation: "update", profile });

          return {
            eq(columnName, clerkUserId) {
              calls.push({ clerkUserId, columnName });

              return {
                select(columns) {
                  calls.push({ columns, operation: "select" });

                  return {
                    maybeSingle() {
                      calls.push({ operation: "maybeSingle" });

                      return Promise.resolve(result);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function loadTermsAcceptanceHelper() {
  const source = await readFile(termsAcceptanceModulePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: termsAcceptanceModulePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Date,
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: termsAcceptanceModulePath,
    },
  );

  return commonJsModule.exports;
}

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

function isTermsAcceptanceHelperImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/auth/terms-acceptance" ||
    resolvedPath === termsAcceptanceModulePath
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

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
