import Link from "next/link";

import { requireClerkUserIdForPage } from "@/lib/auth/clerk";

import {
  acceptAccountTermsPrivacy,
  openBillingPortal,
  startAnnualCheckout,
  startMonthlyCheckout,
} from "./actions";
import {
  readAccountTermsAcceptanceState,
  type AccountTermsAcceptanceState,
} from "./terms-acceptance";

export const dynamic = "force-dynamic";

type AccountPageProps = Readonly<{
  searchParams?: Promise<
    Readonly<{
      billing?: string | string[];
      checkout?: string | string[];
      terms?: string | string[];
    }>
  >;
}>;

export default async function AccountPage({ searchParams }: AccountPageProps) {
  await requireClerkUserIdForPage();

  const [termsState, termsMessage, billingMessage] = await Promise.all([
    readAccountTermsAcceptanceState(),
    resolveTermsMessage(searchParams),
    resolveBillingMessage(searchParams),
  ]);

  return (
    <main className="surface-shell account-shell">
      <section
        className="surface-panel account-panel"
        aria-labelledby="account-heading"
      >
        <header className="account-heading">
          <div>
            <p className="surface-kicker">Account</p>
            <h1 id="account-heading">Account</h1>
          </div>
          <Link className="route-text-link" href="/">
            RubyWhisper home
          </Link>
        </header>
        <section
          className="status-panel account-summary"
          aria-label="Account status summary"
        >
          <p>
            Terms and Privacy acceptance is required before RubyWhisper can
            transcribe trial dictation. This account view records only
            acceptance metadata for the signed-in session.
          </p>
        </section>
        <TermsAcceptanceSection
          message={termsMessage}
          termsState={termsState}
        />
        <BillingActionsSection message={billingMessage} />
      </section>
    </main>
  );
}

function BillingActionsSection({
  message,
}: Readonly<{
  message: string | null;
}>) {
  return (
    <section
      className="status-panel account-status"
      aria-labelledby="billing-heading"
    >
      <p className="account-status-label">Billing</p>
      <h2 id="billing-heading">Plan and billing</h2>
      <p>
        Choose a paid RubyWhisper plan or open billing management for an
        existing subscription from this account.
      </p>
      {message ? (
        <p className="account-feedback" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <div className="account-billing-actions" aria-label="Billing actions">
        <form action={startMonthlyCheckout}>
          <button type="submit">Upgrade monthly</button>
        </form>
        <form action={startAnnualCheckout}>
          <button type="submit">Upgrade annual</button>
        </form>
        <form action={openBillingPortal}>
          <button type="submit">Manage billing</button>
        </form>
      </div>
    </section>
  );
}

function TermsAcceptanceSection({
  message,
  termsState,
}: Readonly<{
  message: string | null;
  termsState: AccountTermsAcceptanceState;
}>) {
  if (termsState.status === "accepted") {
    return (
      <section
        className="status-panel account-status account-status-success"
        aria-labelledby="terms-heading"
      >
        <p className="account-status-label">Accepted</p>
        <h2 id="terms-heading">Terms and Privacy accepted</h2>
        <p>
          Acceptance has been recorded for this account. Timestamp metadata:
          <span className="account-metadata">
            {" "}
            {formatAcceptedAt(termsState.termsAcceptedAt)}
          </span>
          .
        </p>
      </section>
    );
  }

  return (
    <section
      className="status-panel account-status account-status-required"
      aria-labelledby="terms-heading"
    >
      <p className="account-status-label">Required</p>
      <h2 id="terms-heading">Accept Terms and Privacy before transcription</h2>
      <p>
        Final public legal pages are not part of this release step. This
        placeholder confirms that acceptance is required before trial
        transcription and records only the acceptance timestamp.
      </p>
      <p>
        Review the Terms and Privacy pages when they are published. Do not use
        RubyWhisper trial transcription until you are ready to accept those
        notices.
      </p>
      {message ? <p className="account-feedback">{message}</p> : null}
      <TermsUnavailableNote status={termsState.status} />
      <form className="account-acceptance-form" action={acceptAccountTermsPrivacy}>
        <div className="account-checkbox-row">
          <input
            id="termsPrivacyAccepted"
            name="termsPrivacyAccepted"
            required
            type="checkbox"
          />
          <label htmlFor="termsPrivacyAccepted">
            I understand that Terms and Privacy acceptance is required before
            RubyWhisper can transcribe trial dictation.
          </label>
        </div>
        <button type="submit">Accept Terms and Privacy</button>
      </form>
    </section>
  );
}

function TermsUnavailableNote({
  status,
}: Readonly<{
  status: AccountTermsAcceptanceState["status"];
}>) {
  if (status === "profile_missing") {
    return (
      <p className="account-warning">
        Account metadata is not ready for this signed-in session. Acceptance
        can be recorded after the server profile exists.
      </p>
    );
  }

  if (status === "service_unavailable") {
    return (
      <p className="account-warning">
        Acceptance metadata is unavailable in this environment. Server-only
        Supabase configuration is required to record acceptance.
      </p>
    );
  }

  return null;
}

async function resolveTermsMessage(
  searchParams: AccountPageProps["searchParams"],
) {
  const terms = (await searchParams)?.terms;
  const value = Array.isArray(terms) ? terms[0] : terms;

  switch (value) {
    case "accepted":
      return "Terms and Privacy acceptance was recorded.";
    case "missing_acknowledgement":
      return "Check the acknowledgement before submitting acceptance.";
    case "profile_missing":
      return "Account metadata must exist before acceptance can be recorded.";
    case "service_unavailable":
      return "Acceptance could not be recorded in this environment.";
    case "unauthenticated":
      return "Sign in before recording acceptance.";
    default:
      return null;
  }
}

async function resolveBillingMessage(
  searchParams: AccountPageProps["searchParams"],
) {
  const params = await searchParams;
  const billingValue = normalizeSearchParam(params?.billing);
  const checkoutValue = normalizeSearchParam(params?.checkout);

  switch (billingValue) {
    case "checkout_unavailable":
      return "Checkout is temporarily unavailable. Try again later.";
    case "customer_missing":
      return "Billing management is available after a subscription has been created for this account.";
    case "portal_return":
      return "Billing management was closed.";
    case "portal_unavailable":
      return "Billing management is temporarily unavailable. Try again later.";
    case "signed_out":
      return "Sign in before managing billing.";
    default:
      break;
  }

  switch (checkoutValue) {
    case "cancelled":
      return "Checkout was cancelled. No billing changes were made.";
    case "success":
      return "Checkout was completed. Your account may take a moment to update.";
    default:
      return null;
  }
}

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatAcceptedAt(value: string) {
  const acceptedAt = new Date(value);

  if (Number.isNaN(acceptedAt.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(acceptedAt);
}
