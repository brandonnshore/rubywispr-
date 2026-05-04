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
const profileSyncModulePath = path.join(
  srcRoot,
  "lib",
  "auth",
  "profile-sync.ts",
);
const sourceFileExtensions = new Set([".ts", ".tsx"]);

const forbiddenPrivateProfileFragments = [
  "audio",
  "clipboard",
  "context",
  "dictionary",
  "history",
  "recording",
  "transcript",
  "wispr",
];

test("profile sync helper prepares only Supabase profile metadata", async () => {
  const helper = await loadProfileSyncHelper();
  const prepared = helper.prepareClerkUserSupabaseProfile({
    audio: "ignored",
    clerkUserId: " user_123 ",
    primaryEmail: " person@example.com ",
    transcript: "ignored",
  });

  assert.deepEqual(toPlainObject(prepared), {
    action: "prepared",
    ok: true,
    profile: {
      clerk_user_id: "user_123",
      email: "person@example.com",
    },
  });
  assert.deepEqual(Object.keys(prepared.profile).sort(), [
    "clerk_user_id",
    "email",
  ]);
});

test("profile sync helper returns structured missing-input errors", async () => {
  const helper = await loadProfileSyncHelper();

  assert.deepEqual(
    toPlainObject(
      helper.prepareClerkUserSupabaseProfile({ primaryEmail: "a@b.test" }),
    ),
    {
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required to sync a Supabase profile.",
      },
      ok: false,
    },
  );

  assert.deepEqual(
    toPlainObject(helper.prepareClerkUserSupabaseProfile({ clerkUserId: "user_123" })),
    {
      error: {
        code: "missing_primary_email",
        message: "A Clerk primary email is required to sync a Supabase profile.",
      },
      ok: false,
    },
  );
});

test("profile sync helper upserts through the server-only Supabase factory", async () => {
  const helper = await loadProfileSyncHelper();
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        upsert(profile, options) {
          calls.push({ options, profile });

          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  const result = await helper.syncClerkUserSupabaseProfile(
    {
      clerkUserId: "user_123",
      localHistory: "ignored",
      primaryEmail: "person@example.com",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "upserted",
    ok: true,
    profile: {
      clerk_user_id: "user_123",
      email: "person@example.com",
    },
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "profiles" },
    {
      options: { onConflict: "clerk_user_id" },
      profile: {
        clerk_user_id: "user_123",
        email: "person@example.com",
      },
    },
  ]);
});

test("profile sync helper does not create a Supabase client for invalid input", async () => {
  const helper = await loadProfileSyncHelper();

  await helper.syncClerkUserSupabaseProfile(
    { clerkUserId: "user_123" },
    () => {
      throw new Error("Client factory must not be called for invalid input.");
    },
  );
});

test("profile sync helper returns a sanitized Supabase failure", async () => {
  const helper = await loadProfileSyncHelper();
  const client = {
    from() {
      return {
        upsert() {
          return Promise.resolve({
            data: null,
            error: { message: "database detail not returned to callers" },
          });
        },
      };
    },
  };

  const result = await helper.syncClerkUserSupabaseProfile(
    { clerkUserId: "user_123", primaryEmail: "person@example.com" },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    error: {
      code: "supabase_profile_sync_failed",
      message: "Unable to sync the Clerk user profile metadata.",
    },
    ok: false,
  });
});

test("profile sync helper remains server-only and metadata-only", async () => {
  const source = await readFile(profileSyncModulePath, "utf8");

  assert.match(source, /import\s+["']server-only["'];/);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bterms_accepted_at\b|\bis_blocked\b/);

  for (const fragment of forbiddenPrivateProfileFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`, "i"),
      `profile sync helper must not reference private content field "${fragment}"`,
    );
  }
});

test("client-facing code cannot import the profile sync helper", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isProfileSyncHelperImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function loadProfileSyncHelper() {
  const source = await readFile(profileSyncModulePath, "utf8");
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
    fileName: profileSyncModulePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: profileSyncModulePath,
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

function isProfileSyncHelperImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/auth/profile-sync" ||
    resolvedPath === profileSyncModulePath
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
