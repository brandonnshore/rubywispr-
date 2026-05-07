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
const adminBootstrapModulePath = path.join(
  srcRoot,
  "lib",
  "admin",
  "bootstrap.ts",
);
const adminBootstrapEnvName = "RUBYWHISPER_ADMIN_BOOTSTRAP_EMAILS";
const supabaseSecretEnvName = "SUPABASE_SECRET_KEY";
const documentedInitialEmail = ["brandon", "rubyadvisory.com"].join("@");
const documentedInitialEmailMixedCase = ["BRANDON", "RubyAdvisory.com"].join(
  "@",
);
const sourceFileExtensions = new Set([".ts", ".tsx"]);
const forbiddenPrivateAdminBootstrapFragments = [
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
  /private transcript|private audio|private cleaned text|private context|private clipboard|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local|service-role|supabase key/i;

test("admin bootstrap allowlist is disabled when no emails are configured", async () => {
  const helper = await loadAdminBootstrapHelper();

  for (const value of [undefined, null, "", " , ; \n "]) {
    assert.deepEqual(
      toPlainObject(helper.parseRubyWhisperAdminBootstrapEmails(value)),
      {
        emails: [],
        enabled: false,
        expectedInitialEmail: documentedInitialEmail,
        ok: true,
        sourceEnvName: adminBootstrapEnvName,
      },
    );
  }
});

test("admin bootstrap allowlist normalizes, deduplicates, and documents the initial admin email", async () => {
  const helper = await loadAdminBootstrapHelper();

  const result = helper.parseRubyWhisperAdminBootstrapEmails(
    ` ${documentedInitialEmailMixedCase}, teammate@example.com;\n${documentedInitialEmail} `,
  );

  assert.deepEqual(toPlainObject(result), {
    emails: [documentedInitialEmail, "teammate@example.com"],
    enabled: true,
    expectedInitialEmail: documentedInitialEmail,
    ok: true,
    sourceEnvName: adminBootstrapEnvName,
  });
  assert.equal(
    helper.normalizeRubyWhisperAdminBootstrapEmail(
      ` ${documentedInitialEmailMixedCase} `,
    ),
    documentedInitialEmail,
  );
  assert.equal(
    helper.isRubyWhisperBootstrapAdminEmailAllowed(
      documentedInitialEmailMixedCase,
      result,
    ),
    true,
  );
});

test("admin bootstrap allowlist rejects invalid values without echoing them", async () => {
  const helper = await loadAdminBootstrapHelper();

  const result = helper.parseRubyWhisperAdminBootstrapEmails(
    `${documentedInitialEmail}, not an email, root@localhost, bad..dots@example.com`,
  );

  assert.deepEqual(toPlainObject(result), {
    emails: [],
    enabled: false,
    error: {
      code: "invalid_bootstrap_admin_email",
      invalidEmailCount: 3,
      message:
        "Admin bootstrap allowlist contains invalid email configuration.",
    },
    expectedInitialEmail: documentedInitialEmail,
    ok: false,
    sourceEnvName: adminBootstrapEnvName,
  });
  assert.doesNotMatch(JSON.stringify(result), /not an email|localhost|bad\.\.dots/);
});

test("admin bootstrap reconcile writes only active role metadata for allowed verified users", async () => {
  const helper = await loadAdminBootstrapHelper();
  const allowlist = helper.parseRubyWhisperAdminBootstrapEmails(
    documentedInitialEmail,
  );
  const { calls, client } = createAdminBootstrapClient();

  const result = await helper.reconcileRubyWhisperBootstrapAdminRole(
    {
      allowlist,
      verifiedClerkUserId: " user_rw_synthetic_admin_001 ",
      verifiedEmail: ` ${documentedInitialEmailMixedCase} `,
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "seeded",
    clerkUserId: "user_rw_synthetic_admin_001",
    ok: true,
    role: "admin",
    status: "active_admin_seeded",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "admin_roles" },
    {
      operation: "upsert",
      options: { onConflict: "clerk_user_id" },
      row: {
        clerk_user_id: "user_rw_synthetic_admin_001",
        role: "admin",
      },
    },
    {
      columns: "clerk_user_id,role",
      operation: "select",
    },
    { operation: "maybeSingle", phase: "write" },
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /@/);
});

test("admin bootstrap reconcile fails closed before writes for disabled, invalid, or unallowed inputs", async () => {
  const helper = await loadAdminBootstrapHelper();
  const disabledAllowlist = helper.parseRubyWhisperAdminBootstrapEmails("");
  const invalidAllowlist = helper.parseRubyWhisperAdminBootstrapEmails(
    "not-an-email",
  );
  const allowedAllowlist = helper.parseRubyWhisperAdminBootstrapEmails(
    documentedInitialEmail,
  );

  for (const [input, expected] of [
    [
      {
        allowlist: disabledAllowlist,
        verifiedClerkUserId: "user_rw_synthetic_admin_001",
        verifiedEmail: documentedInitialEmail,
      },
      {
        action: "skipped",
        error: {
          code: "bootstrap_allowlist_disabled",
          message: "Admin bootstrap allowlist is not configured.",
        },
        ok: false,
        status: "allowlist_disabled",
      },
    ],
    [
      {
        allowlist: invalidAllowlist,
        verifiedClerkUserId: "user_rw_synthetic_admin_001",
        verifiedEmail: documentedInitialEmail,
      },
      {
        action: "skipped",
        error: {
          code: "invalid_allowlist_config",
          message: "Admin bootstrap allowlist configuration is invalid.",
        },
        ok: false,
        status: "invalid_allowlist",
      },
    ],
    [
      {
        allowlist: allowedAllowlist,
        verifiedClerkUserId: " ",
        verifiedEmail: documentedInitialEmail,
      },
      {
        action: "skipped",
        error: {
          code: "invalid_verified_clerk_user_id",
          message: "A verified Clerk user ID is required for admin bootstrap.",
        },
        ok: false,
        status: "invalid_user",
      },
    ],
    [
      {
        allowlist: allowedAllowlist,
        verifiedClerkUserId: "user_rw_synthetic_admin_001",
        verifiedEmail: "invalid-email",
      },
      {
        action: "skipped",
        clerkUserId: "user_rw_synthetic_admin_001",
        error: {
          code: "invalid_verified_email",
          message: "A verified email address is required for admin bootstrap.",
        },
        ok: false,
        status: "invalid_user",
      },
    ],
    [
      {
        allowlist: allowedAllowlist,
        verifiedClerkUserId: "user_rw_synthetic_admin_001",
        verifiedEmail: "teammate@example.com",
      },
      {
        action: "skipped",
        clerkUserId: "user_rw_synthetic_admin_001",
        error: {
          code: "bootstrap_email_not_allowed",
          message: "Verified email is not allowed for admin bootstrap.",
        },
        ok: false,
        status: "email_not_allowed",
      },
    ],
  ]) {
    const result = await helper.reconcileRubyWhisperBootstrapAdminRole(
      input,
      () => {
        throw new Error("Client factory must not run before valid bootstrap.");
      },
    );

    assert.deepEqual(toPlainObject(result), expected);
    assert.doesNotMatch(JSON.stringify(result), /@|invalid-email/);
  }
});

test("admin bootstrap reconcile fails closed for backend write failures", async () => {
  const helper = await loadAdminBootstrapHelper();
  const allowlist = helper.parseRubyWhisperAdminBootstrapEmails(
    documentedInitialEmail,
  );

  for (const { client } of [
    createAdminBootstrapClient({
      writeError: { message: "database detail must not echo" },
    }),
    createAdminBootstrapClient({ row: null }),
    createAdminBootstrapClient({ rejectWrite: true }),
  ]) {
    const result = await helper.reconcileRubyWhisperBootstrapAdminRole(
      {
        allowlist,
        verifiedClerkUserId: "user_rw_synthetic_admin_001",
        verifiedEmail: documentedInitialEmail,
      },
      () => client,
    );

    assert.deepEqual(toPlainObject(result), {
      action: "skipped",
      clerkUserId: "user_rw_synthetic_admin_001",
      error: {
        code: "supabase_admin_role_write_failed",
        message: "Unable to write admin role metadata.",
      },
      ok: false,
      status: "write_failed",
    });
    assert.doesNotMatch(JSON.stringify(result), /database detail|@/i);
  }

  const factoryFailure = await helper.reconcileRubyWhisperBootstrapAdminRole(
    {
      allowlist,
      verifiedClerkUserId: "user_rw_synthetic_admin_001",
      verifiedEmail: documentedInitialEmail,
    },
    () => {
      throw new Error("private supabase key detail");
    },
  );

  assert.deepEqual(toPlainObject(factoryFailure), {
    action: "skipped",
    clerkUserId: "user_rw_synthetic_admin_001",
    error: {
      code: "supabase_admin_role_write_failed",
      message: "Unable to write admin role metadata.",
    },
    ok: false,
    status: "write_failed",
  });
  assert.doesNotMatch(JSON.stringify(factoryFailure), /supabase key|@/i);
});

test("admin bootstrap helper remains server-only and metadata-only", async () => {
  const source = await readFile(adminBootstrapModulePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/config\/server["']/);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /from\s+["']@\/lib\/admin\/roles["']/);
  assert.match(source, new RegExp(`\\b${adminBootstrapEnvName}\\b`));
  assert.match(source, new RegExp(escapeRegExp(documentedInitialEmail)));
  assert.match(source, /\bsupabaseAdminRolesTableName\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const fragment of forbiddenPrivateAdminBootstrapFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`),
      `admin bootstrap helper must not reference private content field "${fragment}"`,
    );
  }
});

test("client-facing code cannot import or read admin bootstrap config", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    if (new RegExp(`\\b${adminBootstrapEnvName}\\b`).test(source)) {
      violations.push(
        `${path.relative(webRoot, filePath)} references ${adminBootstrapEnvName}`,
      );
    }

    if (new RegExp(`\\b${supabaseSecretEnvName}\\b`).test(source)) {
      violations.push(
        `${path.relative(webRoot, filePath)} references ${supabaseSecretEnvName}`,
      );
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isAdminBootstrapHelperImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("admin bootstrap env examples are blank server-only placeholders", async () => {
  const envExampleFiles = [
    path.join(webRoot, ".env.example"),
    path.join(repoRoot, ".env.example"),
  ];

  for (const filePath of envExampleFiles) {
    const source = await readFile(filePath, "utf8");
    const assignments = source
      .split("\n")
      .filter((line) => line.startsWith(`${adminBootstrapEnvName}=`));

    assert.deepEqual(
      assignments,
      [`${adminBootstrapEnvName}=`],
      `${path.relative(repoRoot, filePath)} must document a blank bootstrap placeholder`,
    );
    assert.doesNotMatch(source, new RegExp(`\\bNEXT_PUBLIC_.*${adminBootstrapEnvName}\\b`));
    assert.match(source, /<verified-admin-email>/);
  }
});

test("admin bootstrap fixture output stays metadata-only", async () => {
  const helper = await loadAdminBootstrapHelper();
  const result = await helper.reconcileRubyWhisperBootstrapAdminRole(
    {
      allowlist: helper.parseRubyWhisperAdminBootstrapEmails(
        documentedInitialEmail,
      ),
      verifiedClerkUserId: "user_rw_synthetic_admin_001",
      verifiedEmail: documentedInitialEmail,
    },
    () => createAdminBootstrapClient().client,
  );

  assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

async function loadAdminBootstrapHelper({ bootstrapAllowedEmails } = {}) {
  const source = await readFile(adminBootstrapModulePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: adminBootstrapModulePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      require(specifier) {
        switch (specifier) {
          case "server-only":
            return {};
          case "@/config/server":
            return {
              serverEnv: {
                admin: {
                  bootstrapAllowedEmails,
                },
              },
            };
          case "@/lib/supabase/server":
            return {
              createSupabaseServiceRoleClient: (createClient) =>
                createClient({
                  serviceRoleKey: "test-service-role-key",
                  url: "https://example.supabase.co",
                }),
            };
          case "@/lib/admin/roles":
            return {
              rubyWhisperActiveAdminRole: "admin",
              supabaseAdminRoleColumns: "clerk_user_id,role",
              supabaseAdminRolesTableName: "admin_roles",
            };
          default:
            throw new Error(`Unexpected test import: ${specifier}`);
        }
      },
    },
    {
      filename: adminBootstrapModulePath,
    },
  );

  return commonJsModule.exports;
}

function createAdminBootstrapClient({
  rejectWrite = false,
  row = {
    clerk_user_id: "user_rw_synthetic_admin_001",
    role: "admin",
  },
  writeError = null,
} = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        upsert(writeRow, options) {
          calls.push({ operation: "upsert", options, row: writeRow });

          return {
            select(columns) {
              calls.push({ columns, operation: "select" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "write" });

                  if (rejectWrite) {
                    return Promise.reject(
                      new Error("private database rejection detail"),
                    );
                  }

                  return Promise.resolve({ data: row, error: writeError });
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

function isAdminBootstrapHelperImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/admin/bootstrap" ||
    resolvedPath === adminBootstrapModulePath
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
