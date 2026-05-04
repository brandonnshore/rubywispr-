import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
const srcRoot = path.join(webRoot, "src");
const friendOfRubyBatchModulePath = path.join(
  srcRoot,
  "lib",
  "friend-of-ruby",
  "batches.ts",
);
const sourceFileExtensions = new Set([".ts", ".tsx"]);

test("Friend of Ruby batch helper creates normalized metadata rows only", async () => {
  const helper = await loadFriendOfRubyBatchHelper();
  const insertedRow = createFriendOfRubyBatchRow({
    code: "FRIENDS-2026",
    created_by_clerk_user_id: "user_rw_synthetic_admin_001",
    expires_at: "2027-05-04T00:00:00.000Z",
    max_redemptions: 10,
    stripe_promotion_code_id: "promo_rw_synthetic_001",
  });
  const { calls, client, insertedRows } = createFriendOfRubyBatchClient({
    insertRow: insertedRow,
  });

  const result = await helper.createFriendOfRubyBatchMetadata(
    {
      code: " friends-2026 ",
      createdByClerkUserId: " user_rw_synthetic_admin_001 ",
      expiresAt: "2027-05-04T00:00:00.000Z",
      ignoredField: "must not be written",
      maxRedemptions: 10,
      stripePromotionCodeId: " promo_rw_synthetic_001 ",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "created",
    batch: {
      code: "FRIENDS-2026",
      createdAt: "2026-05-04T00:00:00.000Z",
      createdByClerkUserId: "user_rw_synthetic_admin_001",
      expiresAt: "2027-05-04T00:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 10,
      stripePromotionCodeId: "promo_rw_synthetic_001",
    },
    ok: true,
    status: "created",
  });
  assert.deepEqual(toPlainObject(insertedRows), [
    {
      code: "FRIENDS-2026",
      created_by_clerk_user_id: "user_rw_synthetic_admin_001",
      expires_at: "2027-05-04T00:00:00.000Z",
      max_redemptions: 10,
      stripe_promotion_code_id: "promo_rw_synthetic_001",
    },
  ]);
  assert.deepEqual(Object.keys(insertedRows[0]).sort(), [
    "code",
    "created_by_clerk_user_id",
    "expires_at",
    "max_redemptions",
    "stripe_promotion_code_id",
  ]);
  assert.deepEqual(toPlainObject(calls), toPlainObject([
    { tableName: "friend_of_ruby_batches" },
    {
      batch: insertedRows[0],
      operation: "insert",
    },
    {
      columns:
        "id,created_by_clerk_user_id,stripe_promotion_code_id,code,max_redemptions,expires_at,created_at",
      operation: "select",
    },
    { operation: "maybeSingle", phase: "insert" },
  ]));
});

test("Friend of Ruby batch helper writes null optional metadata when omitted", async () => {
  const helper = await loadFriendOfRubyBatchHelper();
  const { client, insertedRows } = createFriendOfRubyBatchClient({
    insertRow: createFriendOfRubyBatchRow({
      code: "FRIENDS-2026",
      created_by_clerk_user_id: "user_rw_synthetic_admin_001",
      expires_at: null,
      max_redemptions: 3,
      stripe_promotion_code_id: null,
    }),
  });

  const result = await helper.createFriendOfRubyBatchMetadata(
    {
      code: "FRIENDS-2026",
      createdByClerkUserId: "user_rw_synthetic_admin_001",
      maxRedemptions: 3,
    },
    () => client,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(toPlainObject(insertedRows), [
    {
      code: "FRIENDS-2026",
      created_by_clerk_user_id: "user_rw_synthetic_admin_001",
      expires_at: null,
      max_redemptions: 3,
      stripe_promotion_code_id: null,
    },
  ]);
});

test("Friend of Ruby batch helper rejects invalid input with sanitized errors", async () => {
  const helper = await loadFriendOfRubyBatchHelper();
  const factory = () => {
    throw new Error("Client factory must not be called for invalid input.");
  };
  const invalidInputs = [
    [
      {
        code: "FRIENDS-2026",
        createdByClerkUserId: " ",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "missing_clerk_user_id",
          message:
            "A Clerk user ID is required for Friend of Ruby batch metadata.",
        },
        ok: false,
        status: "missing_creator",
      },
    ],
    [
      {
        code: " ",
        createdByClerkUserId: "user_rw_synthetic_admin_001",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "blank_friend_of_ruby_code",
          message: "A Friend of Ruby batch code is required.",
        },
        ok: false,
        status: "invalid_code",
      },
    ],
    [
      {
        code: "FRIENDS-2026",
        createdByClerkUserId: "user_rw_synthetic_admin_001",
        maxRedemptions: 0,
      },
      {
        error: {
          code: "invalid_friend_of_ruby_max_redemptions",
          message:
            "Friend of Ruby max redemptions must be a positive integer.",
        },
        ok: false,
        status: "invalid_max_redemptions",
      },
    ],
    [
      {
        code: "FRIENDS-2026",
        createdByClerkUserId: "user_rw_synthetic_admin_001",
        expiresAt: "not-a-date",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "invalid_friend_of_ruby_expiration",
          message: "Friend of Ruby expiration must be a valid timestamp.",
        },
        ok: false,
        status: "invalid_expiration",
      },
    ],
    [
      {
        code: "FRIENDS-2026",
        createdByClerkUserId: "user_rw_synthetic_admin_001",
        maxRedemptions: 10,
        stripePromotionCodeId: "not_a_promotion",
      },
      {
        error: {
          code: "invalid_friend_of_ruby_stripe_promotion_code_id",
          message: "Stripe promotion code metadata is not valid.",
        },
        ok: false,
        status: "invalid_stripe_promotion_code",
      },
    ],
    [
      {
        code: "https://example.invalid/private-value",
        createdByClerkUserId: "user_rw_synthetic_admin_001",
        maxRedemptions: 10,
      },
      {
        error: {
          code: "unsafe_friend_of_ruby_batch_metadata",
          message: "Friend of Ruby batch metadata is not safe to store.",
        },
        ok: false,
        status: "invalid_metadata",
      },
    ],
  ];

  for (const [input, expected] of invalidInputs) {
    const result = await helper.createFriendOfRubyBatchMetadata(input, factory);

    assert.deepEqual(toPlainObject(result), expected);
    assert.doesNotMatch(
      JSON.stringify(result),
      /not-a-date|not_a_promotion|example\.invalid|private-value/i,
    );
  }
});

test("Friend of Ruby batch helper reads metadata by normalized code", async () => {
  const helper = await loadFriendOfRubyBatchHelper();
  const { calls, client } = createFriendOfRubyBatchClient({
    readRow: createFriendOfRubyBatchRow({
      code: "FRIENDS-2026",
      created_by_clerk_user_id: "user_rw_synthetic_admin_001",
      max_redemptions: 10,
      stripe_promotion_code_id: "promo_rw_synthetic_001",
    }),
  });

  const result = await helper.readFriendOfRubyBatchMetadataByCode(
    { code: " friends-2026 " },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    batch: {
      code: "FRIENDS-2026",
      createdAt: "2026-05-04T00:00:00.000Z",
      createdByClerkUserId: "user_rw_synthetic_admin_001",
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 10,
      stripePromotionCodeId: "promo_rw_synthetic_001",
    },
    ok: true,
    status: "found",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "friend_of_ruby_batches" },
    {
      columns:
        "id,created_by_clerk_user_id,stripe_promotion_code_id,code,max_redemptions,expires_at,created_at",
      operation: "select",
    },
    {
      columnName: "code",
      operation: "eq",
      value: "FRIENDS-2026",
    },
    { operation: "maybeSingle", phase: "read" },
  ]);
});

test("Friend of Ruby batch helper reads by Stripe promotion code ID and handles missing rows", async () => {
  const helper = await loadFriendOfRubyBatchHelper();
  const { calls, client } = createFriendOfRubyBatchClient({ readRow: null });

  const result =
    await helper.readFriendOfRubyBatchMetadataByStripePromotionCodeId(
      { stripePromotionCodeId: " promo_rw_synthetic_001 " },
      () => client,
    );

  assert.deepEqual(toPlainObject(result), {
    action: "missing",
    ok: true,
    status: "missing",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "friend_of_ruby_batches" },
    {
      columns:
        "id,created_by_clerk_user_id,stripe_promotion_code_id,code,max_redemptions,expires_at,created_at",
      operation: "select",
    },
    {
      columnName: "stripe_promotion_code_id",
      operation: "eq",
      value: "promo_rw_synthetic_001",
    },
    { operation: "maybeSingle", phase: "read" },
  ]);
});

test("Friend of Ruby batch helper sanitizes backend and stored-row failures", async () => {
  const helper = await loadFriendOfRubyBatchHelper();

  const { client: createErrorClient } = createFriendOfRubyBatchClient({
    insertError: { message: "database insert detail must not echo" },
  });
  const createFailure = await helper.createFriendOfRubyBatchMetadata(
    {
      code: "FRIENDS-2026",
      createdByClerkUserId: "user_rw_synthetic_admin_001",
      maxRedemptions: 10,
    },
    () => createErrorClient,
  );

  assert.deepEqual(toPlainObject(createFailure), {
    error: {
      code: "supabase_friend_of_ruby_batch_create_failed",
      message: "Unable to create Friend of Ruby batch metadata.",
    },
    ok: false,
    status: "create_failed",
  });
  assert.doesNotMatch(JSON.stringify(createFailure), /database insert detail/i);

  const { client: readErrorClient } = createFriendOfRubyBatchClient({
    readError: { message: "database read detail must not echo" },
  });
  const readFailure = await helper.readFriendOfRubyBatchMetadataByCode(
    { code: "FRIENDS-2026" },
    () => readErrorClient,
  );

  assert.deepEqual(toPlainObject(readFailure), {
    error: {
      code: "supabase_friend_of_ruby_batch_read_failed",
      message: "Unable to read Friend of Ruby batch metadata.",
    },
    ok: false,
    status: "read_failed",
  });
  assert.doesNotMatch(JSON.stringify(readFailure), /database read detail/i);

  const unsafeStoredRow = helper.normalizeFriendOfRubyBatchRow(
    createFriendOfRubyBatchRow({
      code: "FRIENDS-2026",
      created_by_clerk_user_id: "user_rw_synthetic_admin_001",
      expires_at: "private-row-value",
      max_redemptions: 10,
    }),
  );

  assert.deepEqual(toPlainObject(unsafeStoredRow), {
    error: {
      code: "unsafe_friend_of_ruby_batch_metadata",
      message: "Friend of Ruby batch metadata is not safe to return.",
    },
    ok: false,
    status: "invalid_metadata",
  });
  assert.doesNotMatch(JSON.stringify(unsafeStoredRow), /private-row-value/);
});

test("Friend of Ruby batch helper remains server-only and metadata-only", async () => {
  const source = await readFile(friendOfRubyBatchModulePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bfriend_of_ruby_batches\b/);
  assert.match(source, /\bcreated_by_clerk_user_id\b/);
  assert.match(source, /\bstripe_promotion_code_id\b/);
  assert.match(source, /\bmax_redemptions\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const privateFragment of [
    "audio",
    "rawTranscript",
    "transcript",
    "cleanedText",
    "clipboard",
    "prompt",
    "payment_method",
    "card",
    "invoice",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${privateFragment}\\b`),
      `Friend of Ruby batch helper must not reference private/payment field "${privateFragment}"`,
    );
  }
});

test("client-facing code cannot import the Friend of Ruby batch helper", async () => {
  const sourceFiles = await listSourceFiles(srcRoot);
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (isFriendOfRubyBatchHelperImport(filePath, moduleSpecifier)) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function loadFriendOfRubyBatchHelper() {
  const source = await readFile(friendOfRubyBatchModulePath, "utf8");
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
    fileName: friendOfRubyBatchModulePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: friendOfRubyBatchModulePath,
    },
  );

  return commonJsModule.exports;
}

function createFriendOfRubyBatchClient({
  insertError = null,
  insertRow = null,
  readError = null,
  readRow = null,
} = {}) {
  const calls = [];
  const insertedRows = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        insert(batch) {
          insertedRows.push(batch);
          calls.push({ batch, operation: "insert" });

          return {
            select(columns) {
              calls.push({ columns, operation: "select" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "insert" });

                  return Promise.resolve({
                    data: insertRow,
                    error: insertError,
                  });
                },
              };
            },
          };
        },
        select(columns) {
          calls.push({ columns, operation: "select" });

          return {
            eq(columnName, value) {
              calls.push({ columnName, operation: "eq", value });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "read" });

                  return Promise.resolve({
                    data: readRow,
                    error: readError,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return { calls, client, insertedRows };
}

function createFriendOfRubyBatchRow(overrides = {}) {
  return {
    code: "FRIENDS-2026",
    created_at: "2026-05-04T00:00:00.000Z",
    created_by_clerk_user_id: "user_rw_synthetic_admin_001",
    expires_at: null,
    id: "11111111-1111-4111-8111-111111111111",
    max_redemptions: 10,
    stripe_promotion_code_id: null,
    ...overrides,
  };
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

function isFriendOfRubyBatchHelperImport(importerPath, moduleSpecifier) {
  const resolvedPath = resolveModuleSpecifier(importerPath, moduleSpecifier);

  return (
    moduleSpecifier === "@/lib/friend-of-ruby/batches" ||
    resolvedPath === friendOfRubyBatchModulePath
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
