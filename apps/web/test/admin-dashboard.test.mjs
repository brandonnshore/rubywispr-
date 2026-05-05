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
const adminDashboardPath = path.join(
  webRoot,
  "src",
  "lib",
  "admin",
  "dashboard.ts",
);
const privateContentColumnPattern =
  /\b(raw_transcript|transcript_text|cleaned_text|clipboard|dictionary|local_context|request_body|response_body|headers|cookies|auth_token|stripe_secret|provider_payload|screenshot|replay)\b/i;

test("admin dashboard snapshot reads only allowlisted metadata columns", async () => {
  const dashboardModule = await loadAdminDashboardModule();
  const calls = [];
  const result = await dashboardModule.readRubyWhisperAdminDashboardSnapshot({
    createClient: () => createDashboardClient(calls),
    now: "2026-05-04T12:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.generatedAt, "2026-05-04T12:00:00.000Z");
  assert.deepEqual(
    calls.filter((call) => call.operation === "select"),
    [
      {
        columns:
          "created_by_clerk_user_id,code,max_redemptions,expires_at,created_at",
        operation: "select",
        tableName: "friend_of_ruby_batches",
      },
      {
        columns: "clerk_user_id,email,terms_accepted_at,is_blocked,created_at",
        operation: "select",
        tableName: "profiles",
      },
      {
        columns: "clerk_user_id,request_count,window_start,updated_at",
        operation: "select",
        tableName: "transcription_rate_limits",
      },
      {
        columns:
          "event_type,status,stripe_created_at,processed_at,failed_at,error_code,created_at,updated_at",
        operation: "select",
        tableName: "stripe_webhook_events",
      },
      {
        columns:
          "clerk_user_id,status,plan,current_period_end,friend_of_ruby_until,updated_at",
        operation: "select",
        tableName: "subscriptions",
      },
      {
        columns:
          "clerk_user_id,status,provider,plan_state,audio_duration_ms,cleaned_word_count,latency_ms,error_code,app_version,os_version,created_at",
        operation: "select",
        tableName: "transcription_requests",
      },
      {
        columns:
          "clerk_user_id,trial_words_used,lifetime_words_used,monthly_words_used,monthly_period_start,updated_at",
        operation: "select",
        tableName: "usage_counters",
      },
    ],
  );

  const selectedColumns = calls
    .filter((call) => call.operation === "select")
    .map((call) => call.columns)
    .join(",");

  assert.doesNotMatch(selectedColumns, privateContentColumnPattern);
  assert.doesNotMatch(selectedColumns, /stripe_customer_id|stripe_subscription_id|stripe_event_id|request_id|stripe_promotion_code_id/i);
});

test("admin dashboard snapshot returns source metadata and no private payloads", async () => {
  const dashboardModule = await loadAdminDashboardModule();
  const result = await dashboardModule.readRubyWhisperAdminDashboardSnapshot({
    createClient: () =>
      createDashboardClient([], {
        profiles: [
          {
            clerk_user_id: "user_rw_synthetic_admin_001",
            created_at: "2026-05-04T00:00:00.000Z",
            email: "admin@example.test",
            is_blocked: false,
            terms_accepted_at: "2026-05-04T00:00:00.000Z",
          },
        ],
        transcription_requests: [
          {
            app_version: "0.1.0",
            audio_duration_ms: 1200,
            cleaned_word_count: 2500,
            clerk_user_id: "user_rw_synthetic_admin_001",
            created_at: "2026-05-04T00:00:00.000Z",
            error_code: "rate_limited",
            latency_ms: 250,
            os_version: "macOS 15.0",
            plan_state: "paid_active",
            provider: "mock_provider",
            status: "failure",
          },
        ],
      }),
      now: "2026-05-04T12:00:00.000Z",
    });
  const serializedResult = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.profiles.rows[0].email, "admin@example.test");
  assert.equal(
    result.snapshot.transcriptionRequests.rows[0].error_code,
    "rate_limited",
  );
  assert.doesNotMatch(serializedResult, privateContentColumnPattern);
  assert.doesNotMatch(serializedResult, /private backend detail|sk_test|promo_rw_synthetic/i);
});

test("admin dashboard snapshot marks section reads unavailable without leaking backend details", async () => {
  const dashboardModule = await loadAdminDashboardModule();
  const result = await dashboardModule.readRubyWhisperAdminDashboardSnapshot({
    createClient: () =>
      createDashboardClient([], {
        profiles: new Error("private backend detail"),
      }),
  });
  const serializedResult = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.profiles.ok, false);
  assert.deepEqual(toPlainObject(result.snapshot.profiles.error), {
    code: "supabase_admin_dashboard_read_failed",
    message: "Unable to read admin dashboard metadata.",
  });
  assert.doesNotMatch(serializedResult, /private backend detail/i);
});

async function loadAdminDashboardModule() {
  const source = await readFile(adminDashboardPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: adminDashboardPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createAdminDashboardRequire(),
    },
    {
      filename: adminDashboardPath,
    },
  );

  return commonJsModule.exports;
}

function createAdminDashboardRequire() {
  return function requireAdminDashboardModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient: () => ({}),
        };
      case "@/lib/supabase/server":
        return {
          createSupabaseServiceRoleClient: (createClient) =>
            createClient({
              serviceRoleKey: "service_role_synthetic",
              url: "https://example.supabase.co",
            }),
        };
      default:
        throw new Error(`Unexpected admin dashboard dependency ${specifier}`);
    }
  };
}

function createDashboardClient(calls, rowsByTable = {}) {
  return {
    from(tableName) {
      calls.push({ operation: "from", tableName });

      return {
        select(columns) {
          calls.push({ columns, operation: "select", tableName });

          return {
            order(columnName, options) {
              calls.push({ columnName, operation: "order", options, tableName });

              return {
                async limit(count) {
                  calls.push({ count, operation: "limit", tableName });

                  const rows = rowsByTable[tableName];

                  if (rows instanceof Error) {
                    throw rows;
                  }

                  return {
                    data: rows ?? [],
                    error: null,
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

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
