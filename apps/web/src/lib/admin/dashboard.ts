import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
  type SupabaseServiceRoleRuntimeConfig,
} from "@/lib/supabase/server";

export const adminDashboardProfileColumns =
  "clerk_user_id,email,terms_accepted_at,is_blocked,created_at" as const;
export const adminDashboardSubscriptionColumns =
  "clerk_user_id,status,plan,current_period_end,friend_of_ruby_until,updated_at" as const;
export const adminDashboardUsageCounterColumns =
  "clerk_user_id,trial_words_used,lifetime_words_used,monthly_words_used,monthly_period_start,updated_at" as const;
export const adminDashboardTranscriptionRequestColumns =
  "clerk_user_id,status,provider,plan_state,audio_duration_ms,cleaned_word_count,latency_ms,error_code,app_version,os_version,created_at" as const;
export const adminDashboardRateLimitColumns =
  "clerk_user_id,request_count,window_start,updated_at" as const;
export const adminDashboardFriendOfRubyBatchColumns =
  "created_by_clerk_user_id,code,max_redemptions,expires_at,created_at" as const;
export const adminDashboardStripeWebhookEventColumns =
  "event_type,status,stripe_created_at,processed_at,failed_at,error_code,created_at,updated_at" as const;

const adminDashboardRowsPerSection = 8;
const adminDashboardRequestRowsLimit = 24;

export type AdminDashboardProfileRow = Readonly<{
  clerk_user_id: string;
  created_at: string | null;
  email: string;
  is_blocked: boolean;
  terms_accepted_at: string | null;
}>;

export type AdminDashboardSubscriptionRow = Readonly<{
  clerk_user_id: string;
  current_period_end: string | null;
  friend_of_ruby_until: string | null;
  plan: string;
  status: string;
  updated_at: string | null;
}>;

export type AdminDashboardUsageCounterRow = Readonly<{
  clerk_user_id: string;
  lifetime_words_used: number;
  monthly_period_start: string;
  monthly_words_used: number;
  trial_words_used: number;
  updated_at: string | null;
}>;

export type AdminDashboardTranscriptionRequestRow = Readonly<{
  app_version: string | null;
  audio_duration_ms: number | null;
  cleaned_word_count: number | null;
  clerk_user_id: string;
  created_at: string | null;
  error_code: string | null;
  latency_ms: number | null;
  os_version: string | null;
  plan_state: string;
  provider: string;
  status: "failure" | "success" | string;
}>;

export type AdminDashboardRateLimitRow = Readonly<{
  clerk_user_id: string;
  request_count: number;
  updated_at: string | null;
  window_start: string;
}>;

export type AdminDashboardFriendOfRubyBatchRow = Readonly<{
  code: string;
  created_at: string | null;
  created_by_clerk_user_id: string;
  expires_at: string | null;
  max_redemptions: number;
}>;

export type AdminDashboardStripeWebhookEventRow = Readonly<{
  created_at: string | null;
  error_code: string | null;
  event_type: string;
  failed_at: string | null;
  processed_at: string | null;
  status: "failed" | "processed" | "processing" | string;
  stripe_created_at: string | null;
  updated_at: string | null;
}>;

export type AdminDashboardReadFailure = Readonly<{
  error: {
    code: "supabase_admin_dashboard_read_failed";
    message: string;
  };
  ok: false;
  status: "read_failed";
}>;

export type AdminDashboardSection<Row> =
  | Readonly<{
      ok: true;
      rows: readonly Row[];
      status: "loaded";
    }>
  | AdminDashboardReadFailure;

export type RubyWhisperAdminDashboardSnapshot = Readonly<{
  generatedAt: string;
  friendOfRubyBatches: AdminDashboardSection<AdminDashboardFriendOfRubyBatchRow>;
  profiles: AdminDashboardSection<AdminDashboardProfileRow>;
  rateLimits: AdminDashboardSection<AdminDashboardRateLimitRow>;
  stripeWebhookEvents: AdminDashboardSection<AdminDashboardStripeWebhookEventRow>;
  subscriptions: AdminDashboardSection<AdminDashboardSubscriptionRow>;
  transcriptionRequests: AdminDashboardSection<AdminDashboardTranscriptionRequestRow>;
  usageCounters: AdminDashboardSection<AdminDashboardUsageCounterRow>;
}>;

export type RubyWhisperAdminDashboardSnapshotResult =
  | Readonly<{
      action: "loaded";
      ok: true;
      snapshot: RubyWhisperAdminDashboardSnapshot;
    }>
  | AdminDashboardReadFailure;

type AdminDashboardListResult<Row> = Readonly<{
  data: readonly Row[] | null;
  error: unknown | null;
}>;

type AdminDashboardOrderedQuery<Row> = Readonly<{
  order: (
    columnName: string,
    options: Readonly<{
      ascending: boolean;
    }>,
  ) => Readonly<{
    limit: (count: number) => PromiseLike<AdminDashboardListResult<Row>>;
  }>;
}>;

type AdminDashboardTableQuery<Row, Columns extends string> = Readonly<{
  select: (columns: Columns) => AdminDashboardOrderedQuery<Row>;
}>;

export type SupabaseAdminDashboardClient = Readonly<{
  from: {
    (
      tableName: "profiles",
    ): AdminDashboardTableQuery<
      AdminDashboardProfileRow,
      typeof adminDashboardProfileColumns
    >;
    (
      tableName: "subscriptions",
    ): AdminDashboardTableQuery<
      AdminDashboardSubscriptionRow,
      typeof adminDashboardSubscriptionColumns
    >;
    (
      tableName: "usage_counters",
    ): AdminDashboardTableQuery<
      AdminDashboardUsageCounterRow,
      typeof adminDashboardUsageCounterColumns
    >;
    (
      tableName: "transcription_requests",
    ): AdminDashboardTableQuery<
      AdminDashboardTranscriptionRequestRow,
      typeof adminDashboardTranscriptionRequestColumns
    >;
    (
      tableName: "transcription_rate_limits",
    ): AdminDashboardTableQuery<
      AdminDashboardRateLimitRow,
      typeof adminDashboardRateLimitColumns
    >;
    (
      tableName: "friend_of_ruby_batches",
    ): AdminDashboardTableQuery<
      AdminDashboardFriendOfRubyBatchRow,
      typeof adminDashboardFriendOfRubyBatchColumns
    >;
    (
      tableName: "stripe_webhook_events",
    ): AdminDashboardTableQuery<
      AdminDashboardStripeWebhookEventRow,
      typeof adminDashboardStripeWebhookEventColumns
    >;
  };
}>;

export type ReadRubyWhisperAdminDashboardSnapshotDependencies = Readonly<{
  createClient?: SupabaseServiceRoleClientFactory<SupabaseAdminDashboardClient>;
  now?: Date | string;
}>;

export async function readRubyWhisperAdminDashboardSnapshot(
  dependencies: ReadRubyWhisperAdminDashboardSnapshotDependencies = {},
): Promise<RubyWhisperAdminDashboardSnapshotResult> {
  let client: SupabaseAdminDashboardClient;

  try {
    client = createSupabaseServiceRoleClient(
      dependencies.createClient ?? createAdminDashboardSupabaseClient,
    );
  } catch {
    return adminDashboardReadFailedResult();
  }

  return {
    action: "loaded",
    ok: true,
    snapshot: {
      friendOfRubyBatches: await readFriendOfRubyBatches(client),
      generatedAt: normalizeAdminDashboardTimestamp(dependencies.now),
      profiles: await readProfiles(client),
      rateLimits: await readRateLimits(client),
      stripeWebhookEvents: await readStripeWebhookEvents(client),
      subscriptions: await readSubscriptions(client),
      transcriptionRequests: await readTranscriptionRequests(client),
      usageCounters: await readUsageCounters(client),
    },
  };
}

async function readProfiles(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("profiles")
      .select(adminDashboardProfileColumns)
      .order("created_at", { ascending: false })
      .limit(adminDashboardRowsPerSection);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

async function readSubscriptions(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("subscriptions")
      .select(adminDashboardSubscriptionColumns)
      .order("updated_at", { ascending: false })
      .limit(adminDashboardRowsPerSection);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

async function readUsageCounters(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("usage_counters")
      .select(adminDashboardUsageCounterColumns)
      .order("updated_at", { ascending: false })
      .limit(adminDashboardRowsPerSection);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

async function readTranscriptionRequests(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("transcription_requests")
      .select(adminDashboardTranscriptionRequestColumns)
      .order("created_at", { ascending: false })
      .limit(adminDashboardRequestRowsLimit);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

async function readRateLimits(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("transcription_rate_limits")
      .select(adminDashboardRateLimitColumns)
      .order("updated_at", { ascending: false })
      .limit(adminDashboardRowsPerSection);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

async function readFriendOfRubyBatches(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("friend_of_ruby_batches")
      .select(adminDashboardFriendOfRubyBatchColumns)
      .order("created_at", { ascending: false })
      .limit(adminDashboardRowsPerSection);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

async function readStripeWebhookEvents(client: SupabaseAdminDashboardClient) {
  try {
    const { data, error } = await client
      .from("stripe_webhook_events")
      .select(adminDashboardStripeWebhookEventColumns)
      .order("created_at", { ascending: false })
      .limit(adminDashboardRowsPerSection);

    return normalizeAdminDashboardRows(data, error);
  } catch {
    return adminDashboardReadFailedResult();
  }
}

function normalizeAdminDashboardRows<Row>(
  rows: readonly Row[] | null,
  error: unknown | null,
): AdminDashboardSection<Row> {
  if (error) {
    return adminDashboardReadFailedResult();
  }

  return {
    ok: true,
    rows: rows ?? [],
    status: "loaded",
  };
}

function adminDashboardReadFailedResult(): AdminDashboardReadFailure {
  return {
    error: {
      code: "supabase_admin_dashboard_read_failed",
      message: "Unable to read admin dashboard metadata.",
    },
    ok: false,
    status: "read_failed",
  };
}

function normalizeAdminDashboardTimestamp(nowInput?: Date | string) {
  const now = nowInput ? new Date(nowInput) : new Date();

  if (Number.isFinite(now.getTime())) {
    return now.toISOString();
  }

  return new Date().toISOString();
}

function createAdminDashboardSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): SupabaseAdminDashboardClient {
  return createSupabaseClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as SupabaseAdminDashboardClient;
}
