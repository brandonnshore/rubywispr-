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
const adminRoleModulePath = path.join(
  srcRoot,
  "lib",
  "admin",
  "roles.ts",
);
const sourceFileExtensions = new Set([".ts", ".tsx"]);
const forbiddenPrivateAdminRoleFragments = [
  "audio",
  "cleanedText",
  "clipboard",
  "context",
  "dictionaryTerms",
  "providerRequestBody",
  "providerResponseBody",
  "rawTranscript",
  "secret",
  "token",
  "transcript",
];
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local|service-role/i;

test("admin role lookup allows active admin metadata", async () => {
  const helper = await loadAdminRoleHelper();
  const { calls, client } = createAdminRoleClient({
    row: {
      clerk_user_id: "user_rw_synthetic_admin_001",
      role: " ADMIN ",
    },
  });

  const result = await helper.lookupRubyWhisperAdminRole(
    { clerkUserId: " user_rw_synthetic_admin_001 " },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "allowed",
    allowed: true,
    clerkUserId: "user_rw_synthetic_admin_001",
    ok: true,
    role: "admin",
    status: "active_admin",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "admin_roles" },
    {
      columns: "clerk_user_id,role",
      operation: "select",
    },
    {
      clerkUserId: "user_rw_synthetic_admin_001",
      columnName: "clerk_user_id",
      operation: "eq",
    },
    { operation: "maybeSingle", phase: "read" },
  ]);
});

test("admin role lookup denies missing admin role rows", async () => {
  const helper = await loadAdminRoleHelper();
  const { client } = createAdminRoleClient({ row: null });

  const result = await helper.lookupRubyWhisperAdminRole(
    { clerkUserId: "user_rw_synthetic_member_001" },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "denied",
    allowed: false,
    clerkUserId: "user_rw_synthetic_member_001",
    error: {
      code: "supabase_admin_role_missing",
      message: "No active admin role metadata was found.",
    },
    ok: false,
    status: "missing_role",
  });
});

test("admin role lookup denies inactive and revoked role metadata", async () => {
  const helper = await loadAdminRoleHelper();

  for (const [role, expected] of [
    [
      " inactive ",
      {
        error: {
          code: "supabase_admin_role_inactive",
          message: "Admin role metadata is inactive.",
        },
        role: "inactive",
        status: "inactive_role",
      },
    ],
    [
      "revoked",
      {
        error: {
          code: "supabase_admin_role_revoked",
          message: "Admin role metadata is revoked.",
        },
        role: "revoked",
        status: "revoked_role",
      },
    ],
  ]) {
    const { client } = createAdminRoleClient({
      row: {
        clerk_user_id: "user_rw_synthetic_admin_001",
        role,
      },
    });

    const result = await helper.lookupRubyWhisperAdminRole(
      { clerkUserId: "user_rw_synthetic_admin_001" },
      () => client,
    );

    assert.deepEqual(toPlainObject(result), {
      action: "denied",
      allowed: false,
      clerkUserId: "user_rw_synthetic_admin_001",
      ok: false,
      ...expected,
    });
  }
});

test("admin role lookup denies unrecognized role metadata without echoing it", async () => {
  const helper = await loadAdminRoleHelper();
  const { client } = createAdminRoleClient({
    row: {
      clerk_user_id: "user_rw_synthetic_admin_001",
      role: "super-secret-owner",
    },
  });

  const result = await helper.lookupRubyWhisperAdminRole(
    { clerkUserId: "user_rw_synthetic_admin_001" },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "denied",
    allowed: false,
    clerkUserId: "user_rw_synthetic_admin_001",
    error: {
      code: "supabase_admin_role_unrecognized",
      message: "Admin role metadata is not recognized as active.",
    },
    ok: false,
    status: "unrecognized_role",
  });
  assert.doesNotMatch(JSON.stringify(result), /super-secret-owner/);
});

test("admin role lookup fails closed for missing user IDs and backend errors", async () => {
  const helper = await loadAdminRoleHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.lookupRubyWhisperAdminRole({ clerkUserId: " " }, () => {
        throw new Error("Client factory must not be called for invalid input.");
      }),
    ),
    {
      action: "denied",
      allowed: false,
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required for admin authorization.",
      },
      ok: false,
      status: "missing_user",
    },
  );

  const { client } = createAdminRoleClient({
    readError: { message: "database detail must not echo" },
  });

  const result = await helper.lookupRubyWhisperAdminRole(
    { clerkUserId: "user_rw_synthetic_admin_001" },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "denied",
    allowed: false,
    clerkUserId: "user_rw_synthetic_admin_001",
    error: {
      code: "supabase_admin_role_read_failed",
      message: "Unable to read admin role metadata.",
    },
    ok: false,
    status: "read_failed",
  });
  assert.doesNotMatch(JSON.stringify(result), /database detail/i);
});

test("admin role lookup helper remains server-only and metadata-only", async () => {
  const source = await readFile(adminRoleModulePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\badmin_roles\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const fragment of forbiddenPrivateAdminRoleFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`),
      `admin role helper must not reference private content field "${fragment}"`,
    );
  }
});

test("client-facing code cannot import the admin role helper", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isAdminRoleHelperImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("admin role lookup fixture output stays metadata-only", async () => {
  const helper = await loadAdminRoleHelper();
  const result = await helper.lookupRubyWhisperAdminRole(
    { clerkUserId: "user_rw_synthetic_admin_001" },
    () =>
      createAdminRoleClient({
        row: {
          clerk_user_id: "user_rw_synthetic_admin_001",
          role: "admin",
        },
      }).client,
  );

  assert.equal(result.allowed, true);
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

async function loadAdminRoleHelper() {
  const source = await readFile(adminRoleModulePath, "utf8");
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
    fileName: adminRoleModulePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: adminRoleModulePath,
    },
  );

  return commonJsModule.exports;
}

function createAdminRoleClient({ readError = null, row = null } = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        select(columns) {
          calls.push({ columns, operation: "select" });

          return {
            eq(columnName, clerkUserId) {
              calls.push({ clerkUserId, columnName, operation: "eq" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "read" });

                  return Promise.resolve({ data: row, error: readError });
                },
              };
            },
          };
        },
      };
    },
  };

  return { calls, client };
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

function isAdminRoleHelperImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/admin/roles" ||
    resolvedPath === adminRoleModulePath
  );
}

function resolveModuleSpecifier(importerPath, moduleSpecifier) {
  if (moduleSpecifier.startsWith("@/")) {
    return resolveTypeScriptPath(path.join(srcRoot, moduleSpecifier.slice(2)));
  }

  if (moduleSpecifier.startsWith(".")) {
    return resolveTypeScriptPath(
      path.resolve(path.dirname(importerPath), moduleSpecifier),
    );
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
