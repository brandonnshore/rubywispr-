import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseStripeWebhookEventsTableName =
  "stripe_webhook_events" as const;
export const supabaseStripeWebhookEventsColumns =
  "stripe_event_id,event_type,status,stripe_created_at,processed_at,failed_at,error_code,created_at,updated_at" as const;

export type StripeWebhookEventProcessingStatus =
  | "failed"
  | "processed"
  | "processing";

export type SupabaseStripeWebhookEventRow = Readonly<{
  created_at: string | null;
  error_code: string | null;
  event_type: string;
  failed_at: string | null;
  processed_at: string | null;
  status: StripeWebhookEventProcessingStatus;
  stripe_created_at: string | null;
  stripe_event_id: string;
  updated_at: string | null;
}>;

export type SupabaseStripeWebhookEventInsert = Readonly<{
  created_at: string;
  event_type: string;
  status: "processing";
  stripe_created_at: string | null;
  stripe_event_id: string;
  updated_at: string;
}>;

export type SupabaseStripeWebhookEventUpdate = Readonly<{
  error_code?: string | null;
  failed_at?: string | null;
  processed_at?: string | null;
  status: "failed" | "processed";
  updated_at: string;
}>;

export type StripeWebhookIdempotencyError = Readonly<{
  code:
    | "missing_stripe_event_metadata"
    | "supabase_stripe_webhook_event_claim_failed"
    | "supabase_stripe_webhook_event_update_failed";
  message: string;
}>;

export type ClaimStripeWebhookEventInput = Readonly<{
  eventId?: string | null;
  eventType?: string | null;
  now?: Date | string;
  stripeCreatedAt?: Date | number | string | null;
}>;

export type MarkStripeWebhookEventProcessedInput = Readonly<{
  eventId?: string | null;
  now?: Date | string;
}>;

export type MarkStripeWebhookEventFailedInput = Readonly<{
  errorCode?: string | null;
  eventId?: string | null;
  now?: Date | string;
}>;

export type ClaimStripeWebhookEventResult =
  | Readonly<{
      action: "claimed";
      event: SupabaseStripeWebhookEventRow;
      ok: true;
      status: "claimed";
    }>
  | Readonly<{
      action: "duplicate";
      event: SupabaseStripeWebhookEventRow;
      ok: false;
      status: "duplicate";
    }>
  | StripeWebhookIdempotencyFailure<"claim_failed" | "invalid_input">;

export type MarkStripeWebhookEventResult =
  | Readonly<{
      action: "marked_failed" | "marked_processed";
      event: SupabaseStripeWebhookEventRow;
      ok: true;
      status: "failed" | "processed";
    }>
  | StripeWebhookIdempotencyFailure<"invalid_input" | "update_failed">;

export type StripeWebhookIdempotencyFailure<
  Status extends "claim_failed" | "invalid_input" | "update_failed",
> = Readonly<{
  error: StripeWebhookIdempotencyError;
  ok: false;
  status: Status;
}>;

export type SupabaseStripeWebhookEventSingleResult = Readonly<{
  data: SupabaseStripeWebhookEventRow | null;
  error: unknown | null;
}>;

export type SupabaseStripeWebhookEventInsertQuery = Readonly<{
  select: (
    columns: typeof supabaseStripeWebhookEventsColumns,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseStripeWebhookEventSingleResult>;
  }>;
}>;

export type SupabaseStripeWebhookEventUpdateQuery = Readonly<{
  eq: (
    columnName: "stripe_event_id",
    eventId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseStripeWebhookEventSingleResult>;
  }>;
}>;

export type SupabaseStripeWebhookEventSelectQuery = Readonly<{
  eq: (
    columnName: "stripe_event_id",
    eventId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseStripeWebhookEventSingleResult>;
  }>;
}>;

export type SupabaseStripeWebhookEventTableQuery = Readonly<{
  insert: (
    event: SupabaseStripeWebhookEventInsert,
  ) => SupabaseStripeWebhookEventInsertQuery;
  select: (
    columns: typeof supabaseStripeWebhookEventsColumns,
  ) => SupabaseStripeWebhookEventSelectQuery;
  update: (
    event: SupabaseStripeWebhookEventUpdate,
  ) => Readonly<{
    select: (
      columns: typeof supabaseStripeWebhookEventsColumns,
    ) => SupabaseStripeWebhookEventUpdateQuery;
  }>;
}>;

export type SupabaseStripeWebhookEventClient = Readonly<{
  from: (
    tableName: typeof supabaseStripeWebhookEventsTableName,
  ) => SupabaseStripeWebhookEventTableQuery;
}>;

export async function claimStripeWebhookEvent<
  Client extends SupabaseStripeWebhookEventClient,
>(
  input: ClaimStripeWebhookEventInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<ClaimStripeWebhookEventResult> {
  const eventId = normalizeEventText(input.eventId);
  const eventType = normalizeEventText(input.eventType);

  if (!eventId || !eventType) {
    return invalidInputResult();
  }

  try {
    const now = normalizeTimestamp(input.now);
    const client = createSupabaseServiceRoleClient(createClient);
    const { data, error } = await client
      .from(supabaseStripeWebhookEventsTableName)
      .insert({
        created_at: now,
        event_type: eventType,
        status: "processing",
        stripe_created_at: normalizeStripeCreatedTimestamp(
          input.stripeCreatedAt,
        ),
        stripe_event_id: eventId,
        updated_at: now,
      })
      .select(supabaseStripeWebhookEventsColumns)
      .maybeSingle();

    if (!error && data) {
      return {
        action: "claimed",
        event: data,
        ok: true,
        status: "claimed",
      };
    }

    if (!isUniqueConstraintError(error)) {
      return claimFailedResult();
    }

    const existingEvent = await readStripeWebhookEvent(client, eventId);

    if (!existingEvent) {
      return claimFailedResult();
    }

    return {
      action: "duplicate",
      event: existingEvent,
      ok: false,
      status: "duplicate",
    };
  } catch {
    return claimFailedResult();
  }
}

export async function markStripeWebhookEventProcessed<
  Client extends SupabaseStripeWebhookEventClient,
>(
  input: MarkStripeWebhookEventProcessedInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<MarkStripeWebhookEventResult> {
  const eventId = normalizeEventText(input.eventId);

  if (!eventId) {
    return invalidInputResult();
  }

  const processedAt = normalizeTimestamp(input.now);

  return updateStripeWebhookEvent(
    eventId,
    {
      error_code: null,
      processed_at: processedAt,
      status: "processed",
      updated_at: processedAt,
    },
    "marked_processed",
    "processed",
    createClient,
  );
}

export async function markStripeWebhookEventFailed<
  Client extends SupabaseStripeWebhookEventClient,
>(
  input: MarkStripeWebhookEventFailedInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<MarkStripeWebhookEventResult> {
  const eventId = normalizeEventText(input.eventId);

  if (!eventId) {
    return invalidInputResult();
  }

  const failedAt = normalizeTimestamp(input.now);

  return updateStripeWebhookEvent(
    eventId,
    {
      error_code: normalizeErrorCode(input.errorCode),
      failed_at: failedAt,
      status: "failed",
      updated_at: failedAt,
    },
    "marked_failed",
    "failed",
    createClient,
  );
}

async function readStripeWebhookEvent<
  Client extends SupabaseStripeWebhookEventClient,
>(client: Client, eventId: string) {
  const { data, error } = await client
    .from(supabaseStripeWebhookEventsTableName)
    .select(supabaseStripeWebhookEventsColumns)
    .eq("stripe_event_id", eventId)
    .maybeSingle();

  if (error || !data) {
    return undefined;
  }

  return data;
}

async function updateStripeWebhookEvent<
  Client extends SupabaseStripeWebhookEventClient,
>(
  eventId: string,
  event: SupabaseStripeWebhookEventUpdate,
  action: "marked_failed" | "marked_processed",
  status: "failed" | "processed",
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<MarkStripeWebhookEventResult> {
  let result: SupabaseStripeWebhookEventSingleResult;

  try {
    const client = createSupabaseServiceRoleClient(createClient);
    result = await client
      .from(supabaseStripeWebhookEventsTableName)
      .update(event)
      .select(supabaseStripeWebhookEventsColumns)
      .eq("stripe_event_id", eventId)
      .maybeSingle();
  } catch {
    return updateFailedResult();
  }

  if (result.error || !result.data) {
    return updateFailedResult();
  }

  return {
    action,
    event: result.data,
    ok: true,
    status,
  };
}

function invalidInputResult(): StripeWebhookIdempotencyFailure<"invalid_input"> {
  return {
    error: {
      code: "missing_stripe_event_metadata",
      message: "Stripe webhook event metadata is required.",
    },
    ok: false,
    status: "invalid_input",
  };
}

function claimFailedResult(): StripeWebhookIdempotencyFailure<"claim_failed"> {
  return {
    error: {
      code: "supabase_stripe_webhook_event_claim_failed",
      message: "Unable to claim Stripe webhook event metadata.",
    },
    ok: false,
    status: "claim_failed",
  };
}

function updateFailedResult(): StripeWebhookIdempotencyFailure<"update_failed"> {
  return {
    error: {
      code: "supabase_stripe_webhook_event_update_failed",
      message: "Unable to update Stripe webhook event metadata.",
    },
    ok: false,
    status: "update_failed",
  };
}

function normalizeEventText(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? "";

  if (trimmedValue.length > 255) {
    return "";
  }

  return trimmedValue;
}

function normalizeErrorCode(value: string | null | undefined) {
  const normalizedValue = normalizeEventText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);

  return normalizedValue || "stripe_webhook_event_processing_failed";
}

function normalizeStripeCreatedTimestamp(
  value: Date | number | string | null | undefined,
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return normalizeTimestamp(new Date(value * 1_000));
  }

  return normalizeTimestamp(value);
}

function normalizeTimestamp(value: Date | string | undefined) {
  const timestamp =
    value instanceof Date ? value : value ? new Date(value) : new Date();

  if (Number.isFinite(timestamp.getTime())) {
    return timestamp.toISOString();
  }

  return new Date().toISOString();
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";

  return code === "23505";
}
