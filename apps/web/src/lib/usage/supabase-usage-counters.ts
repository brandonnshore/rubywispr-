import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

import {
  createRubyWhisperTrialQuotaState,
  normalizeRubyWhisperUsageWordCount,
  rubyWhisperDefaultTrialWordsLimit,
  type RubyWhisperTrialQuotaState,
} from "./quota";

export const supabaseUsageCountersTableName = "usage_counters" as const;
export const supabaseUsageCountersColumns =
  "clerk_user_id,trial_words_used,lifetime_words_used,monthly_words_used,monthly_period_start,updated_at" as const;
export const supabaseUsageCountersUpsertConflictTarget =
  "clerk_user_id" as const;

export type SupabaseUsageCounterRow = Readonly<{
  clerk_user_id: string;
  lifetime_words_used: number;
  monthly_period_start: string;
  monthly_words_used: number;
  trial_words_used: number;
  updated_at: string | null;
}>;

export type SupabaseUsageCounterUpsert = Readonly<{
  clerk_user_id: string;
  lifetime_words_used: number;
  monthly_period_start: string;
  monthly_words_used: number;
  trial_words_used: number;
  updated_at: string;
}>;

export type RubyWhisperUsageCounters = RubyWhisperTrialQuotaState &
  Readonly<{
    clerkUserId: string;
    lifetimeWordsUsed: number;
    monthlyPeriodStart: string;
    monthlyWordsUsed: number;
    updatedAt?: string;
  }>;

export type RubyWhisperUsageCountersError = Readonly<{
  code:
    | "missing_clerk_user_id"
    | "supabase_usage_counters_read_failed"
    | "supabase_usage_counters_write_failed";
  message: string;
}>;

export type RubyWhisperUsageCountersFailure = Readonly<{
  error: RubyWhisperUsageCountersError;
  ok: false;
  status: "missing_user" | "read_failed" | "write_failed";
}>;

export type RubyWhisperUsageCountersReadResult =
  | Readonly<{
      action: "defaulted" | "found";
      counters: RubyWhisperUsageCounters;
      ok: true;
    }>
  | RubyWhisperUsageCountersFailure;

export type RubyWhisperUsageCountersIncrementPreparedResult =
  | Readonly<{
      action: "prepared";
      counters: RubyWhisperUsageCounters;
      ok: true;
      usageCounter: SupabaseUsageCounterUpsert;
    }>
  | RubyWhisperUsageCountersFailure;

export type RubyWhisperUsageCountersIncrementUpsertedResult =
  | Readonly<{
      action: "upserted";
      counters: RubyWhisperUsageCounters;
      ok: true;
      usageCounter: SupabaseUsageCounterUpsert;
    }>
  | RubyWhisperUsageCountersFailure;

export type ReadRubyWhisperUsageCountersInput = Readonly<{
  clerkUserId?: string | null;
  now?: Date | string;
}>;

export type PrepareRubyWhisperUsageCounterIncrementInput =
  ReadRubyWhisperUsageCountersInput &
    Readonly<{
      billableWordCount?: unknown;
      currentCounters?: Partial<RubyWhisperUsageCounters> | null;
      incrementTrialWords?: boolean;
    }>;

export type SupabaseUsageCountersSingleResult = Readonly<{
  data: SupabaseUsageCounterRow | null;
  error: unknown | null;
}>;

export type SupabaseUsageCountersSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseUsageCountersSingleResult>;
  }>;
}>;

export type SupabaseUsageCountersUpsertQuery = Readonly<{
  select: (
    columns: typeof supabaseUsageCountersColumns,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseUsageCountersSingleResult>;
  }>;
}>;

export type SupabaseUsageCountersTableQuery = Readonly<{
  select: (
    columns: typeof supabaseUsageCountersColumns,
  ) => SupabaseUsageCountersSelectQuery;
  upsert: (
    usageCounter: SupabaseUsageCounterUpsert,
    options: Readonly<{
      onConflict: typeof supabaseUsageCountersUpsertConflictTarget;
    }>,
  ) => SupabaseUsageCountersUpsertQuery;
}>;

export type SupabaseUsageCountersClient = Readonly<{
  from: (
    tableName: typeof supabaseUsageCountersTableName,
  ) => SupabaseUsageCountersTableQuery;
}>;

export async function readRubyWhisperUsageCounters<
  Client extends SupabaseUsageCountersClient,
>(
  input: ReadRubyWhisperUsageCountersInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperUsageCountersReadResult> {
  const clerkUserId = normalizeUsageCounterText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseUsageCountersTableName)
    .select(supabaseUsageCountersColumns)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    return {
      error: {
        code: "supabase_usage_counters_read_failed",
        message: "Unable to read usage counter metadata.",
      },
      ok: false,
      status: "read_failed",
    };
  }

  if (!data) {
    return {
      action: "defaulted",
      counters: createDefaultUsageCounters(clerkUserId, input.now),
      ok: true,
    };
  }

  return {
    action: "found",
    counters: normalizeUsageCounterRow(data, input.now),
    ok: true,
  };
}

export function prepareRubyWhisperUsageCounterIncrement(
  input: PrepareRubyWhisperUsageCounterIncrementInput,
): RubyWhisperUsageCountersIncrementPreparedResult {
  const clerkUserId = normalizeUsageCounterText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const billableWordCount = normalizeRubyWhisperUsageWordCount(
    input.billableWordCount,
  );
  const currentCounters =
    input.currentCounters && input.currentCounters.clerkUserId
      ? normalizeUsageCounterMetadata(input.currentCounters, input.now)
      : createDefaultUsageCounters(clerkUserId, input.now);
  const monthlyPeriodStart = normalizeMonthlyPeriodStart(input.now);
  const monthlyBase =
    currentCounters.monthlyPeriodStart === monthlyPeriodStart
      ? currentCounters.monthlyWordsUsed
      : 0;
  const trialWordsIncrement =
    input.incrementTrialWords === false ? 0 : billableWordCount;
  const usageCounter: SupabaseUsageCounterUpsert = {
    clerk_user_id: clerkUserId,
    lifetime_words_used: currentCounters.lifetimeWordsUsed + billableWordCount,
    monthly_period_start: monthlyPeriodStart,
    monthly_words_used: monthlyBase + billableWordCount,
    trial_words_used: currentCounters.trialWordsUsed + trialWordsIncrement,
    updated_at: normalizeUsageCounterTimestamp(input.now),
  };

  return {
    action: "prepared",
    counters: normalizeUsageCounterRow(usageCounter, input.now),
    ok: true,
    usageCounter,
  };
}

export async function upsertRubyWhisperUsageCounterIncrement<
  Client extends SupabaseUsageCountersClient,
>(
  input: PrepareRubyWhisperUsageCounterIncrementInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperUsageCountersIncrementUpsertedResult> {
  const preparedIncrement = prepareRubyWhisperUsageCounterIncrement(input);

  if (!preparedIncrement.ok) {
    return preparedIncrement;
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseUsageCountersTableName)
    .upsert(preparedIncrement.usageCounter, {
      onConflict: supabaseUsageCountersUpsertConflictTarget,
    })
    .select(supabaseUsageCountersColumns)
    .maybeSingle();

  if (error) {
    return {
      error: {
        code: "supabase_usage_counters_write_failed",
        message: "Unable to write usage counter metadata.",
      },
      ok: false,
      status: "write_failed",
    };
  }

  return {
    action: "upserted",
    counters: data
      ? normalizeUsageCounterRow(data, input.now)
      : preparedIncrement.counters,
    ok: true,
    usageCounter: preparedIncrement.usageCounter,
  };
}

function createDefaultUsageCounters(
  clerkUserId: string,
  nowInput?: Date | string,
): RubyWhisperUsageCounters {
  return {
    ...createRubyWhisperTrialQuotaState(),
    clerkUserId,
    lifetimeWordsUsed: 0,
    monthlyPeriodStart: normalizeMonthlyPeriodStart(nowInput),
    monthlyWordsUsed: 0,
  };
}

function normalizeUsageCounterRow(
  row: SupabaseUsageCounterRow | SupabaseUsageCounterUpsert,
  nowInput?: Date | string,
): RubyWhisperUsageCounters {
  return normalizeUsageCounterMetadata(
    {
      clerkUserId: row.clerk_user_id,
      lifetimeWordsUsed: row.lifetime_words_used,
      monthlyPeriodStart: row.monthly_period_start,
      monthlyWordsUsed: row.monthly_words_used,
      trialWordsUsed: row.trial_words_used,
      updatedAt: row.updated_at ?? undefined,
    },
    nowInput,
  );
}

function normalizeUsageCounterMetadata(
  counters: Partial<RubyWhisperUsageCounters>,
  nowInput?: Date | string,
): RubyWhisperUsageCounters {
  const clerkUserId = normalizeUsageCounterText(counters.clerkUserId);
  const trialWordsLimit =
    normalizeRubyWhisperUsageWordCount(counters.trialWordsLimit) ||
    rubyWhisperDefaultTrialWordsLimit;
  const trialQuota = createRubyWhisperTrialQuotaState({
    trialWordsLimit,
    trialWordsUsed: counters.trialWordsUsed,
  });

  return {
    ...trialQuota,
    clerkUserId,
    lifetimeWordsUsed: normalizeRubyWhisperUsageWordCount(
      counters.lifetimeWordsUsed,
    ),
    monthlyPeriodStart: normalizeMonthlyPeriodStart(
      counters.monthlyPeriodStart ?? nowInput,
    ),
    monthlyWordsUsed: normalizeRubyWhisperUsageWordCount(
      counters.monthlyWordsUsed,
    ),
    ...(counters.updatedAt ? { updatedAt: counters.updatedAt } : {}),
  };
}

function missingUserResult(): RubyWhisperUsageCountersFailure {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for usage counter metadata.",
    },
    ok: false,
    status: "missing_user",
  };
}

function normalizeUsageCounterText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeUsageCounterTimestamp(nowInput?: Date | string) {
  const now = normalizeDate(nowInput);

  return now.toISOString();
}

function normalizeMonthlyPeriodStart(nowInput?: Date | string) {
  const now = normalizeDate(nowInput);
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  return periodStart.toISOString().slice(0, 10);
}

function normalizeDate(input?: Date | string) {
  const date = input ? new Date(input) : new Date();

  if (Number.isFinite(date.getTime())) {
    return date;
  }

  return new Date();
}
