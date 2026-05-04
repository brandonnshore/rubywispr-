import assert from "node:assert/strict";
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
const customerMetadataPath = path.join(
  webRoot,
  "src",
  "lib",
  "account",
  "subscription-customer-metadata.ts",
);

test("subscription customer metadata helper reads only customer metadata", async () => {
  const helper = await loadSubscriptionCustomerMetadataHelper();
  const row = {
    clerk_user_id: "user_rw_synthetic_member_001",
    stripe_customer_id: " cus_rw_synthetic_member_001 ",
  };
  const { calls, client } = createSubscriptionCustomerMetadataClient({ row });

  const result = await helper.readRubyWhisperSubscriptionCustomerMetadata(
    { clerkUserId: " user_rw_synthetic_member_001 " },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    customerMetadata: {
      clerkUserId: "user_rw_synthetic_member_001",
      stripeCustomerId: "cus_rw_synthetic_member_001",
    },
    ok: true,
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "subscriptions" },
    {
      columns: "clerk_user_id,stripe_customer_id",
      operation: "select",
    },
    {
      clerkUserId: "user_rw_synthetic_member_001",
      columnName: "clerk_user_id",
      operation: "eq",
    },
    { operation: "maybeSingle", phase: "read" },
  ]);
});

test("subscription customer metadata helper treats missing rows or invalid customers as absent", async () => {
  const helper = await loadSubscriptionCustomerMetadataHelper();

  for (const row of [
    null,
    {
      clerk_user_id: "user_rw_synthetic_member_001",
      stripe_customer_id: null,
    },
    {
      clerk_user_id: "user_rw_synthetic_member_001",
      stripe_customer_id: "not_a_customer",
    },
  ]) {
    const { client } = createSubscriptionCustomerMetadataClient({ row });
    const result = await helper.readRubyWhisperSubscriptionCustomerMetadata(
      { clerkUserId: "user_rw_synthetic_member_001" },
      () => client,
    );

    assert.deepEqual(toPlainObject(result), {
      action: "missing",
      customerMetadata: {
        clerkUserId: "user_rw_synthetic_member_001",
      },
      ok: true,
    });
  }
});

test("subscription customer metadata helper returns sanitized failures", async () => {
  const helper = await loadSubscriptionCustomerMetadataHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperSubscriptionCustomerMetadata(
        { clerkUserId: " " },
        () => {
          throw new Error("Client factory must not be called.");
        },
      ),
    ),
    {
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required for billing customer metadata.",
      },
      ok: false,
      status: "missing_user",
    },
  );

  const { client } = createSubscriptionCustomerMetadataClient({
    readError: { message: "database detail must not echo" },
  });
  const result = await helper.readRubyWhisperSubscriptionCustomerMetadata(
    { clerkUserId: "user_rw_synthetic_member_001" },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    error: {
      code: "supabase_subscription_customer_metadata_read_failed",
      message: "Unable to read billing customer metadata.",
    },
    ok: false,
    status: "read_failed",
  });
  assert.doesNotMatch(JSON.stringify(result), /database detail|service-role/);
});

test("subscription customer metadata helper remains server-only and narrow", async () => {
  const source = await readFile(customerMetadataPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bsubscriptions\b/);
  assert.match(source, /\bstripe_customer_id\b/);
  assert.doesNotMatch(source, /\bstripe_subscription_id\b/);
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
      `customer metadata helper must not reference private/payment field "${privateFragment}"`,
    );
  }
});

async function loadSubscriptionCustomerMetadataHelper() {
  const source = await readFile(customerMetadataPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: customerMetadataPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: customerMetadataPath,
    },
  );

  return commonJsModule.exports;
}

function createSubscriptionCustomerMetadataClient({
  readError = null,
  row = null,
} = {}) {
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

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
