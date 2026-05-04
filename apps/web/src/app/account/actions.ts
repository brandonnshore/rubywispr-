"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { POST as createStripeCheckoutSession } from "../api/stripe/checkout/route";
import { POST as createStripePortalSession } from "../api/stripe/portal/route";
import { recordSignedInAccountTermsAcceptance } from "./terms-acceptance";

type AccountBillingPlan = "monthly" | "annual";
type AccountBillingRoutePayload = Readonly<{
  error?: Readonly<{
    code?: unknown;
  }>;
  ok?: unknown;
  url?: unknown;
}>;
type BillingFallbacks = Readonly<{
  customerMissing: string;
  signedOut: string;
  unavailable: string;
}>;

export async function acceptAccountTermsPrivacy(formData: FormData) {
  if (formData.get("termsPrivacyAccepted") !== "on") {
    redirect("/account?terms=missing_acknowledgement");
  }

  const result = await recordSignedInAccountTermsAcceptance();

  if (result.status === "accepted") {
    revalidatePath("/account");
  }

  redirect(`/account?terms=${result.status}`);
}

export async function startMonthlyCheckout() {
  redirect(await resolveCheckoutRedirect("monthly"));
}

export async function startAnnualCheckout() {
  redirect(await resolveCheckoutRedirect("annual"));
}

export async function openBillingPortal() {
  redirect(
    await resolveBillingRedirect(
      createStripePortalSession(),
      {
        customerMissing: "/account?billing=customer_missing",
        signedOut: "/account?billing=signed_out",
        unavailable: "/account?billing=portal_unavailable",
      },
    ),
  );
}

async function resolveCheckoutRedirect(plan: AccountBillingPlan) {
  return resolveBillingRedirect(
    createStripeCheckoutSession(
      new Request("https://app.rubywhisper.local/api/stripe/checkout", {
        body: JSON.stringify({ plan }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    ),
    {
      customerMissing: "/account?billing=checkout_unavailable",
      signedOut: "/account?billing=signed_out",
      unavailable: "/account?billing=checkout_unavailable",
    },
  );
}

async function resolveBillingRedirect(
  routeResponsePromise: Promise<Response>,
  fallbacks: BillingFallbacks,
) {
  try {
    const response = await routeResponsePromise;
    const payload = await readBillingRoutePayload(response);

    if (response.ok && isExternalBillingRedirect(payload?.url)) {
      return payload.url;
    }

    const code = typeof payload?.error?.code === "string"
      ? payload.error.code
      : "";

    if (code === "signed_out") {
      return fallbacks.signedOut;
    }

    if (code === "stripe_portal_customer_missing") {
      return fallbacks.customerMissing;
    }

    return fallbacks.unavailable;
  } catch {
    return fallbacks.unavailable;
  }
}

async function readBillingRoutePayload(response: Response) {
  const payload = await response.json().catch(() => null);

  return payload && typeof payload === "object"
    ? (payload as AccountBillingRoutePayload)
    : null;
}

function isExternalBillingRedirect(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:";
  } catch {
    return false;
  }
}
