import "server-only";

import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import {
  normalizeStripeBillingConfig,
  verifyStripeWebhookEvent,
  type StripeBillingConfigResult,
  type StripeWebhookEventVerificationResult,
} from "@/lib/billing/stripe";
import {
  claimStripeWebhookEvent,
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
  type ClaimStripeWebhookEventInput,
  type ClaimStripeWebhookEventResult,
  type MarkStripeWebhookEventFailedInput,
  type MarkStripeWebhookEventProcessedInput,
  type MarkStripeWebhookEventResult,
  type SupabaseStripeWebhookEventClient,
} from "@/lib/billing/stripe-webhook-idempotency";
import {
  stripeSubscriptionCacheEventTypes,
  upsertStripeSubscriptionCacheFromEvent,
  type NormalizeStripeSubscriptionCacheEventInput,
  type StripeSubscriptionCacheEvent,
  type StripeSubscriptionCacheUpsertResult,
  type SupabaseStripeSubscriptionCacheClient,
} from "@/lib/billing/stripe-subscription-cache";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supportedSubscriptionCacheEventTypes = new Set<string>(
  stripeSubscriptionCacheEventTypes,
);

type StripeWebhookRouteDependencies = Readonly<{
  claimEvent: (
    input: ClaimStripeWebhookEventInput,
  ) => Promise<ClaimStripeWebhookEventResult>;
  markEventFailed: (
    input: MarkStripeWebhookEventFailedInput,
  ) => Promise<MarkStripeWebhookEventResult>;
  markEventProcessed: (
    input: MarkStripeWebhookEventProcessedInput,
  ) => Promise<MarkStripeWebhookEventResult>;
  resolveBillingConfig: () => StripeBillingConfigResult;
  upsertSubscriptionCache: (
    input: NormalizeStripeSubscriptionCacheEventInput,
  ) => Promise<StripeSubscriptionCacheUpsertResult>;
  verifyEvent: (input: {
    rawBody: string;
    signatureHeader?: string | null;
  }) => StripeWebhookEventVerificationResult;
}>;

type StripeWebhookRouteEvent = Pick<
  Stripe.Event,
  "created" | "data" | "id" | "type"
>;

export function createStripeWebhookRouteHandler(
  dependencies: StripeWebhookRouteDependencies,
) {
  return async function POST(request: Request) {
    const rawBody = await request.text().catch(() => null);

    if (rawBody === null) {
      return stripeWebhookErrorResponse({
        code: "stripe_webhook_payload_invalid",
        httpStatus: 400,
        message: "Stripe webhook could not be verified.",
      });
    }

    const verified = dependencies.verifyEvent({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
    });

    if (!verified.ok) {
      return stripeWebhookErrorResponse({
        code: verified.error.code,
        httpStatus: verified.error.httpStatus,
        message: verified.error.message,
      });
    }

    const event = verified.event as StripeWebhookRouteEvent;
    const claim = await dependencies.claimEvent({
      eventId: event.id,
      eventType: event.type,
      stripeCreatedAt: event.created,
    });
    const retryingFailedEvent =
      !claim.ok &&
      claim.status === "duplicate" &&
      claim.event.status === "failed";

    if (!claim.ok && !retryingFailedEvent) {
      if (claim.status === "duplicate") {
        return stripeWebhookAcknowledgedResponse("duplicate");
      }

      return stripeWebhookErrorResponse({
        code: claim.error.code,
        httpStatus: claim.status === "invalid_input" ? 400 : 503,
        message: "Stripe webhook event could not be claimed.",
      });
    }

    if (!supportedSubscriptionCacheEventTypes.has(event.type)) {
      const markedIgnored = await dependencies.markEventProcessed({
        eventId: event.id,
      });

      if (!markedIgnored.ok) {
        return stripeWebhookProcessingFailureResponse(markedIgnored);
      }

      return stripeWebhookAcknowledgedResponse("ignored");
    }

    const configResult = dependencies.resolveBillingConfig();

    if (!configResult.ok) {
      const markedFailed = await dependencies.markEventFailed({
        errorCode: configResult.error.code,
        eventId: event.id,
      });

      if (!markedFailed.ok) {
        return stripeWebhookProcessingFailureResponse(markedFailed);
      }

      return stripeWebhookErrorResponse({
        code: "stripe_webhook_billing_config_unavailable",
        httpStatus: 503,
        message: "Stripe webhook event could not be processed.",
      });
    }

    const cacheResult = await dependencies.upsertSubscriptionCache({
      event: event as StripeSubscriptionCacheEvent,
      priceIds: configResult.config.priceIds,
    });

    if (!cacheResult.ok) {
      const markedFailed = await dependencies.markEventFailed({
        errorCode: cacheResult.error.code,
        eventId: event.id,
      });

      if (!markedFailed.ok) {
        return stripeWebhookProcessingFailureResponse(markedFailed);
      }

      return stripeWebhookErrorResponse({
        code:
          cacheResult.status === "write_failed"
            ? "stripe_webhook_cache_write_failed"
            : "stripe_webhook_event_mapping_failed",
        httpStatus: cacheResult.status === "write_failed" ? 500 : 422,
        message: "Stripe webhook event could not be processed.",
      });
    }

    const markedProcessed = await dependencies.markEventProcessed({
      eventId: event.id,
    });

    if (!markedProcessed.ok) {
      return stripeWebhookProcessingFailureResponse(markedProcessed);
    }

    return stripeWebhookAcknowledgedResponse("processed");
  };
}

const defaultStripeWebhookRouteDependencies: StripeWebhookRouteDependencies = {
  claimEvent: (input) =>
    claimStripeWebhookEvent(input, createStripeWebhookSupabaseClient),
  markEventFailed: (input) =>
    markStripeWebhookEventFailed(input, createStripeWebhookSupabaseClient),
  markEventProcessed: (input) =>
    markStripeWebhookEventProcessed(input, createStripeWebhookSupabaseClient),
  resolveBillingConfig: normalizeStripeBillingConfig,
  upsertSubscriptionCache: (input) =>
    upsertStripeSubscriptionCacheFromEvent(
      input,
      createStripeWebhookSupabaseClient,
    ),
  verifyEvent: verifyStripeWebhookEvent,
};

export const POST = createStripeWebhookRouteHandler(
  defaultStripeWebhookRouteDependencies,
);

function createStripeWebhookSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): SupabaseStripeWebhookEventClient & SupabaseStripeSubscriptionCacheClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as SupabaseStripeWebhookEventClient &
    SupabaseStripeSubscriptionCacheClient;
}

function stripeWebhookAcknowledgedResponse(
  action: "duplicate" | "ignored" | "processed",
) {
  return Response.json(
    {
      action,
      ok: true,
      received: true,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}

function stripeWebhookProcessingFailureResponse(
  result: Extract<MarkStripeWebhookEventResult, { ok: false }>,
) {
  return stripeWebhookErrorResponse({
    code: result.error.code,
    httpStatus: result.status === "invalid_input" ? 400 : 500,
    message: "Stripe webhook event status could not be updated.",
  });
}

function stripeWebhookErrorResponse(input: {
  code: string;
  httpStatus: 400 | 422 | 500 | 503;
  message: string;
}) {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        message: input.message,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: input.httpStatus,
    },
  );
}
