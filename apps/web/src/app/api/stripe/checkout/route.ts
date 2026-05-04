import "server-only";

import type Stripe from "stripe";

import { clientEnv } from "@/config/client";
import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import {
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";
import {
  createStripeBillingContext,
  normalizeStripeBillingConfig,
  resolveStripeBillingPlan,
  type StripeBillingContextResult,
  type StripeBillingPlan,
} from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StripeCheckoutSessionClient = Pick<Stripe, "checkout">;

type StripeCheckoutRouteDependencies = Readonly<{
  appUrl?: string;
  createCheckoutSession: (
    input: Stripe.Checkout.SessionCreateParams,
    client: StripeCheckoutSessionClient,
  ) => Promise<Stripe.Checkout.Session>;
  createStripeContext: () => StripeBillingContextResult<StripeCheckoutSessionClient>;
  requireAuth: () => Promise<ClerkRequiredAuthState>;
  resolveBillingConfig: () => ReturnType<typeof normalizeStripeBillingConfig>;
}>;

type StripeCheckoutRequestBody = Readonly<{
  plan?: unknown;
}>;

export function createStripeCheckoutRouteHandler(
  dependencies: StripeCheckoutRouteDependencies,
) {
  return async function POST(request: Request) {
    const authState = await dependencies.requireAuth();

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    const body = await readStripeCheckoutRequestBody(request);
    const configResult = dependencies.resolveBillingConfig();

    if (!configResult.ok) {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }

    const planResult = resolveStripeBillingPlan(
      typeof body?.plan === "string" ? body.plan : "",
      configResult.config,
    );

    if (!planResult.ok) {
      return stripeCheckoutInvalidPlanResponse();
    }

    const contextResult = dependencies.createStripeContext();

    if (!contextResult.ok) {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }

    const appUrl = resolveSafeAppUrl(dependencies.appUrl);

    if (!appUrl) {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }

    try {
      const session = await dependencies.createCheckoutSession(
        createStripeCheckoutSessionParams({
          appUrl,
          clerkUserId: authState.userId,
          plan: planResult.plan,
          priceId: planResult.priceId,
        }),
        contextResult.context.client,
      );

      if (!isSafeStripeCheckoutUrl(session.url)) {
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

const defaultStripeCheckoutRouteDependencies: StripeCheckoutRouteDependencies = {
  appUrl: clientEnv.appUrl,
  createCheckoutSession: (input, client) =>
    client.checkout.sessions.create(input),
  createStripeContext: () =>
    createStripeBillingContext<StripeCheckoutSessionClient>(),
  requireAuth: requireClerkUserId,
  resolveBillingConfig: normalizeStripeBillingConfig,
};

export const POST = createStripeCheckoutRouteHandler(
  defaultStripeCheckoutRouteDependencies,
);

function createStripeCheckoutSessionParams(
  input: Readonly<{
    appUrl: string;
    clerkUserId: string;
    plan: StripeBillingPlan;
    priceId: string;
  }>,
): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    clerkUserId: input.clerkUserId,
    rubyWhisperPlan: input.plan,
  };

  return {
    cancel_url: new URL("/account?checkout=cancelled", input.appUrl).href,
    client_reference_id: input.clerkUserId,
    line_items: [
      {
        price: input.priceId,
        quantity: 1,
      },
    ],
    metadata,
    mode: "subscription",
    subscription_data: {
      metadata,
    },
    success_url: new URL("/account?checkout=success", input.appUrl).href,
  };
}

async function readStripeCheckoutRequestBody(
  request: Request,
): Promise<StripeCheckoutRequestBody | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  const body = await request.json().catch(() => null);

  return body && typeof body === "object" ? body : null;
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

function isSafeStripeCheckoutUrl(value: string | null) {
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

function stripeCheckoutInvalidPlanResponse() {
  return Response.json(
    {
      ok: false,
      error: {
        code: "stripe_checkout_plan_invalid",
        message: "Choose a valid RubyWhisper billing plan.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 400,
    },
  );
}
