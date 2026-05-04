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
const helperPath = path.join(
  webRoot,
  "src",
  "lib",
  "billing",
  "stripe-webhook-idempotency.ts",
);
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260504113000_add_stripe_webhook_events.sql",
);
const now = "2026-05-04T12:00:00.000Z";
const processedAt = "2026-05-04T12:01:00.000Z";
const failedAt = "2026-05-04T12:02:00.000Z";
const eventId = "evt_rw_synthetic_001";
const eventType = "customer.subscription.updated";
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local|whsec_|sk_test_/i;

test("Stripe webhook idempotency helper claims first delivery metadata", async () => {
  const helper = await loadIdempotencyHelper();
  const { calls, client } = createStripeWebhookEventsClient();

  const result = await helper.claimStripeWebhookEvent(
    {
      eventId: ` ${eventId} `,
      eventType: ` ${eventType} `,
      now,
      stripeCreatedAt: 1777895940,
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "claimed",
    event: {
      created_at: now,
      error_code: null,
      event_type: eventType,
      failed_at: null,
      processed_at: null,
      status: "processing",
      stripe_created_at: "2026-05-04T11:59:00.000Z",
      stripe_event_id: eventId,
      updated_at: now,
    },
    ok: true,
    status: "claimed",
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "stripe_webhook_events" },
    {
      event: {
        created_at: now,
        event_type: eventType,
        status: "processing",
        stripe_created_at: "2026-05-04T11:59:00.000Z",
        stripe_event_id: eventId,
        updated_at: now,
      },
      operation: "insert",
    },
    {
      columns:
        "stripe_event_id,event_type,status,stripe_created_at,processed_at,failed_at,error_code,created_at,updated_at",
      operation: "select_after_insert",
    },
    { operation: "maybeSingle", phase: "insert" },
  ]);
});

test("Stripe webhook idempotency helper rejects duplicate in-flight events", async () => {
  const helper = await loadIdempotencyHelper();
  const existingEvent = stripeWebhookEventRow({ status: "processing" });
  const { calls, client } = createStripeWebhookEventsClient({
    existingEvent,
    insertError: { code: "23505", message: "detail must not echo" },
  });

  const result = await helper.claimStripeWebhookEvent(
    { eventId, eventType, now },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "duplicate",
    event: existingEvent,
    ok: false,
    status: "duplicate",
  });
  assert.deepEqual(
    toPlainObject(calls).filter((call) => call.operation === "insert").length,
    1,
  );
  assert.deepEqual(
    toPlainObject(calls).filter((call) => call.operation === "select").length,
    1,
  );
});

test("Stripe webhook idempotency helper rejects already processed events", async () => {
  const helper = await loadIdempotencyHelper();
  const existingEvent = stripeWebhookEventRow({
    processed_at: processedAt,
    status: "processed",
  });
  const { client } = createStripeWebhookEventsClient({
    existingEvent,
    insertError: { code: "23505", message: "duplicate key detail" },
  });

  const claim = await helper.claimStripeWebhookEvent(
    { eventId, eventType, now },
    () => client,
  );

  assert.deepEqual(toPlainObject(claim), {
    action: "duplicate",
    event: existingEvent,
    ok: false,
    status: "duplicate",
  });

  const markProcessed = await helper.markStripeWebhookEventProcessed(
    { eventId, now: processedAt },
    () => client,
  );

  assert.deepEqual(toPlainObject(markProcessed), {
    action: "marked_processed",
    event: stripeWebhookEventRow({
      error_code: null,
      processed_at: processedAt,
      status: "processed",
      updated_at: processedAt,
    }),
    ok: true,
    status: "processed",
  });
});

test("Stripe webhook idempotency helper marks and rejects failed events", async () => {
  const helper = await loadIdempotencyHelper();
  const existingEvent = stripeWebhookEventRow({
    error_code: "stripe_customer_not_found",
    failed_at: failedAt,
    status: "failed",
    updated_at: failedAt,
  });
  const { client } = createStripeWebhookEventsClient({
    existingEvent,
    insertError: { code: "23505", message: "duplicate key detail" },
  });

  const markedFailed = await helper.markStripeWebhookEventFailed(
    {
      errorCode: "Stripe customer not found!",
      eventId,
      now: failedAt,
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(markedFailed), {
    action: "marked_failed",
    event: existingEvent,
    ok: true,
    status: "failed",
  });

  const claim = await helper.claimStripeWebhookEvent(
    { eventId, eventType, now },
    () => client,
  );

  assert.deepEqual(toPlainObject(claim), {
    action: "duplicate",
    event: existingEvent,
    ok: false,
    status: "duplicate",
  });
});

test("Stripe webhook idempotency helper fails closed for backend errors", async () => {
  const helper = await loadIdempotencyHelper();
  const { client: insertFailureClient } = createStripeWebhookEventsClient({
    insertError: { code: "PGRST999", message: "backend detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.claimStripeWebhookEvent(
        { eventId, eventType, now },
        () => insertFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_stripe_webhook_event_claim_failed",
        message: "Unable to claim Stripe webhook event metadata.",
      },
      ok: false,
      status: "claim_failed",
    },
  );

  const factoryFailure = await helper.claimStripeWebhookEvent(
    { eventId, eventType, now },
    () => {
      throw new Error("private service-role config detail");
    },
  );

  assert.deepEqual(toPlainObject(factoryFailure), {
    error: {
      code: "supabase_stripe_webhook_event_claim_failed",
      message: "Unable to claim Stripe webhook event metadata.",
    },
    ok: false,
    status: "claim_failed",
  });
  assert.doesNotMatch(JSON.stringify(factoryFailure), /service-role config/i);

  const { client: rejectedInsertClient } = createStripeWebhookEventsClient({
    rejectInsert: true,
  });

  assert.deepEqual(
    toPlainObject(
      await helper.claimStripeWebhookEvent(
        { eventId, eventType, now },
        () => rejectedInsertClient,
      ),
    ),
    {
      error: {
        code: "supabase_stripe_webhook_event_claim_failed",
        message: "Unable to claim Stripe webhook event metadata.",
      },
      ok: false,
      status: "claim_failed",
    },
  );

  const { client: duplicateReadFailureClient } = createStripeWebhookEventsClient({
    insertError: { code: "23505", message: "duplicate key detail" },
    readError: { message: "backend detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.claimStripeWebhookEvent(
        { eventId, eventType, now },
        () => duplicateReadFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_stripe_webhook_event_claim_failed",
        message: "Unable to claim Stripe webhook event metadata.",
      },
      ok: false,
      status: "claim_failed",
    },
  );

  const { client: rejectedDuplicateReadClient } =
    createStripeWebhookEventsClient({
      insertError: { code: "23505", message: "duplicate key detail" },
      rejectRead: true,
    });

  assert.deepEqual(
    toPlainObject(
      await helper.claimStripeWebhookEvent(
        { eventId, eventType, now },
        () => rejectedDuplicateReadClient,
      ),
    ),
    {
      error: {
        code: "supabase_stripe_webhook_event_claim_failed",
        message: "Unable to claim Stripe webhook event metadata.",
      },
      ok: false,
      status: "claim_failed",
    },
  );

  const { client: updateFailureClient } = createStripeWebhookEventsClient({
    updateError: { message: "backend detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.markStripeWebhookEventProcessed(
        { eventId, now },
        () => updateFailureClient,
      ),
    ),
    {
      error: {
        code: "supabase_stripe_webhook_event_update_failed",
        message: "Unable to update Stripe webhook event metadata.",
      },
      ok: false,
      status: "update_failed",
    },
  );

  const updateFactoryFailure =
    await helper.markStripeWebhookEventProcessed(
      { eventId, now },
      () => {
        throw new Error("private update factory detail");
      },
    );

  assert.deepEqual(toPlainObject(updateFactoryFailure), {
    error: {
      code: "supabase_stripe_webhook_event_update_failed",
      message: "Unable to update Stripe webhook event metadata.",
    },
    ok: false,
    status: "update_failed",
  });
  assert.doesNotMatch(JSON.stringify(updateFactoryFailure), /factory detail/i);

  const { client: rejectedUpdateClient } = createStripeWebhookEventsClient({
    rejectUpdate: true,
  });

  assert.deepEqual(
    toPlainObject(
      await helper.markStripeWebhookEventFailed(
        { eventId, now },
        () => rejectedUpdateClient,
      ),
    ),
    {
      error: {
        code: "supabase_stripe_webhook_event_update_failed",
        message: "Unable to update Stripe webhook event metadata.",
      },
      ok: false,
      status: "update_failed",
    },
  );
});

test("Stripe webhook idempotency helper remains server-only and metadata-only", async () => {
  const source = await readFile(helperPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bstripe_webhook_events\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

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
    "authorization",
    "token",
    "secret",
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${privateKey}\\b`));
  }
});

test("Stripe webhook event migration stores only delivery metadata", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const columns = extractStripeWebhookEventColumns(sql);

  assert.deepEqual(columns, [
    "id",
    "stripe_event_id",
    "event_type",
    "status",
    "stripe_created_at",
    "processed_at",
    "failed_at",
    "error_code",
    "created_at",
    "updated_at",
  ]);
  assert.match(
    sql,
    /alter\s+table\s+public\.stripe_webhook_events\s+enable\s+row\s+level\s+security\s*;/i,
  );
  assert.match(sql, /metadata only/i);
  assert.doesNotMatch(JSON.stringify(columns), forbiddenPrivateFixturePattern);
});

async function loadIdempotencyHelper() {
  const source = await readFile(helperPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.local' });\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
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
      filename: helperPath,
    },
  );

  return commonJsModule.exports;
}

function createStripeWebhookEventsClient({
  existingEvent = stripeWebhookEventRow(),
  insertError = null,
  readError = null,
  rejectInsert = false,
  rejectRead = false,
  rejectUpdate = false,
  updateError = null,
} = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        insert(event) {
          calls.push({ event, operation: "insert" });

          return {
            select(columns) {
              calls.push({ columns, operation: "select_after_insert" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "insert" });

                  if (rejectInsert) {
                    return Promise.reject(
                      new Error("private insert rejection detail"),
                    );
                  }

                  return Promise.resolve({
                    data: insertError ? null : stripeWebhookEventRow(event),
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
            eq(columnName, selectedEventId) {
              calls.push({
                columnName,
                eventId: selectedEventId,
                operation: "eq",
              });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "read" });

                  if (rejectRead) {
                    return Promise.reject(
                      new Error("private read rejection detail"),
                    );
                  }

                  return Promise.resolve({
                    data: readError ? null : existingEvent,
                    error: readError,
                  });
                },
              };
            },
          };
        },
        update(event) {
          calls.push({ event, operation: "update" });

          return {
            select(columns) {
              calls.push({ columns, operation: "select_after_update" });

              return {
                eq(columnName, selectedEventId) {
                  calls.push({
                    columnName,
                    eventId: selectedEventId,
                    operation: "eq_after_update",
                  });

                  return {
                    maybeSingle() {
                      calls.push({ operation: "maybeSingle", phase: "update" });

                      if (rejectUpdate) {
                        return Promise.reject(
                          new Error("private update rejection detail"),
                        );
                      }

                      return Promise.resolve({
                        data: updateError
                          ? null
                          : stripeWebhookEventRow(event),
                        error: updateError,
                      });
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

  return { calls, client };
}

function stripeWebhookEventRow(overrides = {}) {
  return {
    created_at: now,
    error_code: null,
    event_type: eventType,
    failed_at: null,
    processed_at: null,
    status: "processing",
    stripe_created_at: null,
    stripe_event_id: eventId,
    updated_at: now,
    ...overrides,
  };
}

function extractStripeWebhookEventColumns(sql) {
  const match = sql.match(
    /create\s+table\s+public\.stripe_webhook_events\s*\(([\s\S]+?)\n\);/i,
  );

  assert.ok(match, "migration must create public.stripe_webhook_events");

  const definitions = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const constraintIndex = definitions.findIndex((line) =>
    line.startsWith("constraint"),
  );

  return definitions
    .slice(0, constraintIndex === -1 ? definitions.length : constraintIndex)
    .map((line) => line.match(/^([a-z_][a-z0-9_]*)\b/i)?.[1])
    .filter(Boolean);
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
