import "server-only";

import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { clientEnv } from "@/config/client";
import {
  readRubyWhisperSubscriptionCustomerMetadata,
  type RubyWhisperSubscriptionCustomerMetadataReadResult,
  type SupabaseSubscriptionCustomerMetadataClient,
} from "@/lib/account/subscription-customer-metadata";
import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import {
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";
import {
  createStripeBillingContext,
  normalizeStripeBillingConfig,
  type StripeBillingContextResult,
} from "@/lib/billing/stripe";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StripePortalSessionClient = Pick<Stripe, "billingPortal">;

type StripePortalRouteDependencies = Readonly<{
  appUrl?: string;
  createPortalSession: (
    input: Stripe.BillingPortal.SessionCreateParams,
    client: StripePortalSessionClient,
  ) => Promise<Stripe.BillingPortal.Session>;
  createStripeContext: () => StripeBillingContextResult<StripePortalSessionClient>;
  readCustomerMetadata: (
    clerkUserId: string,
  ) => Promise<RubyWhisperSubscriptionCustomerMetadataReadResult>;
  requireAuth: () => Promise<ClerkRequiredAuthState>;
  resolveBillingConfig: () => ReturnType<typeof normalizeStripeBillingConfig>;
}>;

export function createStripePortalRouteHandler(
  dependencies: StripePortalRouteDependencies,
) {
  return async function POST() {
    const authState = await dependencies.requireAuth();

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    try {
      const customerResult = await dependencies.readCustomerMetadata(
        authState.userId,
      );

      if (!customerResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      if (!customerResult.customerMetadata.stripeCustomerId) {
        return stripePortalMissingCustomerResponse();
      }

      const configResult = dependencies.resolveBillingConfig();

      if (!configResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const contextResult = dependencies.createStripeContext();

      if (!contextResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const appUrl = resolveSafeAppUrl(dependencies.appUrl);

      if (!appUrl) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const session = await dependencies.createPortalSession(
        createStripePortalSessionParams({
          appUrl,
          stripeCustomerId: customerResult.customerMetadata.stripeCustomerId,
        }),
        contextResult.context.client,
      );

      if (!isSafeStripePortalUrl(session.url)) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      return Response.json(
        {
          ok: true,
          url: session.url,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 200,
        },
      );
    } catch {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }
  };
}

const defaultStripePortalRouteDependencies: StripePortalRouteDependencies = {
  appUrl: clientEnv.appUrl,
  createPortalSession: (input, client) =>
    client.billingPortal.sessions.create(input),
  createStripeContext: () =>
    createStripeBillingContext<StripePortalSessionClient>(),
  readCustomerMetadata: (clerkUserId) =>
    readRubyWhisperSubscriptionCustomerMetadata(
      { clerkUserId },
      createStripePortalSupabaseClient,
    ),
  requireAuth: requireClerkUserId,
  resolveBillingConfig: normalizeStripeBillingConfig,
};

export const POST = createStripePortalRouteHandler(
  defaultStripePortalRouteDependencies,
);

function createStripePortalSessionParams(
  input: Readonly<{
    appUrl: string;
    stripeCustomerId: string;
  }>,
): Stripe.BillingPortal.SessionCreateParams {
  return {
    customer: input.stripeCustomerId,
    return_url: new URL("/account?billing=portal_return", input.appUrl).href,
  };
}

function createStripePortalSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): SupabaseSubscriptionCustomerMetadataClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as SupabaseSubscriptionCustomerMetadataClient;
}

function resolveSafeAppUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.hostname === "localhost"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function isSafeStripePortalUrl(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function stripePortalMissingCustomerResponse() {
  return Response.json(
    {
      ok: false,
      error: {
        action: "open_checkout_or_contact_support",
        code: "stripe_portal_customer_missing",
        message: "No billing portal is available for this account yet.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 409,
    },
  );
}
