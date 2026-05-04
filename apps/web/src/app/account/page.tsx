import Link from "next/link";

import { clientEnv } from "@/config/client";
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
import {
  readAccountPageMetadata,
  type AccountMetadataState,
  type AccountPageMetadata,
} from "./metadata";

export const dynamic = "force-dynamic";

const supportEmail = "brandon@rubyadvisory.com";

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
  const clerkUserId = await requireClerkUserIdForPage();

  const [termsState, accountMetadata, termsMessage, billingMessage] =
    await Promise.all([
      readAccountTermsAcceptanceState(),
      readAccountPageMetadata(clerkUserId),
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
          <Link className="route-text-link" href="/support">
            Support
          </Link>
        </header>
        <section
          className="status-panel account-summary"
          aria-label="Account status summary"
        >
          <p>
            This signed-in account view shows account, plan, billing, support,
            download, and aggregate usage metadata only. It does not display
            dictation text, local context, clipboard data, dictionary data, or
            media from the Mac app.
          </p>
        </section>
        <ProfileSection metadata={accountMetadata} />
        <TermsAcceptanceSection
          message={termsMessage}
          termsState={termsState}
        />
        <PlanStatusSection metadata={accountMetadata} />
        <UsageMetadataSection metadata={accountMetadata} />
        <BillingActionsSection message={billingMessage} />
        <DownloadSection />
        <SupportSection />
      </section>
    </main>
  );
}

function ProfileSection({
  metadata,
}: Readonly<{
  metadata: AccountPageMetadata;
}>) {
  const profile = metadata.profile;

  return (
    <section
      className="status-panel account-status"
      aria-labelledby="account-profile-heading"
    >
      <p className="account-status-label">Profile</p>
      <h2 id="account-profile-heading">Signed-in account</h2>
      {profile.ok ? (
        <dl className="account-metadata-list">
          <div>
            <dt>Email</dt>
            <dd>{profile.value.email}</dd>
          </div>
          <div>
            <dt>Account access</dt>
            <dd>{profile.value.isBlocked ? "Blocked" : "Enabled"}</dd>
          </div>
        </dl>
      ) : (
        <UnavailableMetadataNotice
          label="Profile metadata"
          state={profile}
        />
      )}
    </section>
  );
}

function DownloadSection() {
  const latestDownloadUrl = clientEnv.latestAppDownloadUrl;

  return (
    <section
      className={
        latestDownloadUrl
          ? "status-panel account-status account-status-success"
          : "status-panel account-status account-status-required"
      }
      aria-labelledby="account-download-heading"
    >
      <p className="account-status-label">
        {latestDownloadUrl ? "Available" : "Beta artifact pending"}
      </p>
      <h2 id="account-download-heading">Mac beta app</h2>
      {latestDownloadUrl ? (
        <>
          <p>
            Release hosting is configured for the latest RubyWhisper Mac beta.
            Keep this account available for sign-in, Terms/Privacy acceptance,
            and billing state.
          </p>
          <div className="account-action-row" aria-label="Download actions">
            <a
              className="rw-button"
              href={latestDownloadUrl}
              rel="noopener noreferrer"
            >
              Download RubyWhisper Mac beta
            </a>
            <Link className="rw-button rw-button-secondary" href="/download">
              Open download page
            </Link>
          </div>
        </>
      ) : (
        <>
          <p>
            No public Mac beta artifact is configured for this environment.
            This placeholder avoids local paths, private URLs, or claims about
            signing and notarization that belong to later release work.
          </p>
          <Link className="rw-button rw-button-secondary" href="/download">
            Open download page
          </Link>
        </>
      )}
    </section>
  );
}

function PlanStatusSection({
  metadata,
}: Readonly<{
  metadata: AccountPageMetadata;
}>) {
  const snapshot = metadata.snapshot.ok ? metadata.snapshot.value : null;
  const subscription = metadata.subscription.ok
    ? metadata.subscription.value
    : null;
  const planState = snapshot?.planState ?? subscription?.planState;

  return (
    <section
      className={resolvePlanStatusClassName(planState)}
      aria-labelledby="account-plan-heading"
    >
      <p className="account-status-label">
        {planState ? formatPlanState(planState) : "Unavailable"}
      </p>
      <h2 id="account-plan-heading">Plan status</h2>
      {planState ? (
        <>
          <p>
            Plan and entitlement state is metadata-only and may take a moment
            to update after checkout or billing changes.
          </p>
          <dl className="account-metadata-list">
            <div>
              <dt>Plan state</dt>
              <dd>{formatPlanState(planState)}</dd>
            </div>
            <div>
              <dt>Account state</dt>
              <dd>
                {snapshot ? formatPlanState(snapshot.accountStatus) : "Pending"}
              </dd>
            </div>
            <div>
              <dt>Current plan</dt>
              <dd>
                {subscription ? formatPlanState(subscription.plan) : "Pending"}
              </dd>
            </div>
            <div>
              <dt>Subscription status</dt>
              <dd>
                {subscription?.subscriptionStatus
                  ? formatPlanState(subscription.subscriptionStatus)
                  : "No active subscription metadata"}
              </dd>
            </div>
            <div>
              <dt>Can transcribe</dt>
              <dd>
                {snapshot ? formatBoolean(snapshot.canTranscribe) : "Pending"}
              </dd>
            </div>
            <div>
              <dt>Current period ends</dt>
              <dd>{formatOptionalDate(subscription?.currentPeriodEnd)}</dd>
            </div>
            <div>
              <dt>Friend of Ruby until</dt>
              <dd>{formatOptionalDate(subscription?.friendOfRubyUntil)}</dd>
            </div>
            <div>
              <dt>Plan metadata updated</dt>
              <dd>{formatOptionalDate(subscription?.updatedAt)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <UnavailableMetadataNotice
          label="Plan metadata"
          state={metadata.subscription}
        />
      )}
      {!metadata.snapshot.ok && planState ? (
        <p className="account-warning">
          Full account readiness is unavailable until profile, plan, and usage
          metadata can be read together.
        </p>
      ) : null}
    </section>
  );
}

function UsageMetadataSection({
  metadata,
}: Readonly<{
  metadata: AccountPageMetadata;
}>) {
  const usage = metadata.snapshot.ok
    ? metadata.snapshot.value
    : metadata.usageCounters.ok
      ? metadata.usageCounters.value
      : null;

  return (
    <section
      className="status-panel account-status"
      aria-labelledby="account-usage-heading"
    >
      <p className="account-status-label">Usage</p>
      <h2 id="account-usage-heading">Trial and usage metadata</h2>
      {usage ? (
        <>
          <p>
            Word counts are aggregate usage metadata for account and plan
            decisions. Private Mac app content is not shown here.
          </p>
          <dl className="account-metadata-list account-usage-list">
            <div>
              <dt>Trial words used</dt>
              <dd>{formatNumber(usage.trialWordsUsed)}</dd>
            </div>
            <div>
              <dt>Trial words limit</dt>
              <dd>{formatNumber(usage.trialWordsLimit)}</dd>
            </div>
            <div>
              <dt>Trial words remaining</dt>
              <dd>{formatNumber(usage.trialWordsRemaining)}</dd>
            </div>
            <div>
              <dt>Trial state</dt>
              <dd>
                {usage.isTrialExhausted
                  ? "Exhausted"
                  : usage.isTrialLow
                    ? "Low"
                    : "Available"}
              </dd>
            </div>
            <div>
              <dt>Monthly words used</dt>
              <dd>{formatNumber(usage.monthlyWordsUsed)}</dd>
            </div>
            <div>
              <dt>Monthly period start</dt>
              <dd>{formatOptionalDate(usage.monthlyPeriodStart)}</dd>
            </div>
            <div>
              <dt>Lifetime words used</dt>
              <dd>{formatNumber(usage.lifetimeWordsUsed)}</dd>
            </div>
            <div>
              <dt>Usage metadata updated</dt>
              <dd>
                {"updatedAt" in usage
                  ? formatOptionalDate(usage.updatedAt)
                  : "Available from account snapshot"}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <UnavailableMetadataNotice
          label="Usage metadata"
          state={metadata.usageCounters}
        />
      )}
    </section>
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
        existing subscription. Checkout and portal sessions are created by
        server actions.
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

function SupportSection() {
  return (
    <section
      className="status-panel account-status"
      aria-labelledby="account-support-heading"
    >
      <p className="account-status-label">Support</p>
      <h2 id="account-support-heading">Account support</h2>
      <p>
        For account, billing, or beta access help, review support guidance or
        email support without including private dictation text or local app
        content.
      </p>
      <div className="account-action-row" aria-label="Support actions">
        <Link className="rw-button rw-button-secondary" href="/support">
          Open support
        </Link>
        <a
          className="rw-button rw-button-secondary"
          href={`mailto:${supportEmail}`}
        >
          Email support
        </a>
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
        Review the current{" "}
        <Link className="route-text-link" href="/terms">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="route-text-link" href="/privacy">
          Privacy
        </Link>{" "}
        pages before accepting. Acceptance is required before trial
        transcription and records only the acceptance timestamp.
      </p>
      <p>
        Do not use RubyWhisper trial transcription until you are ready to
        accept those notices.
      </p>
      {message ? <p className="account-feedback">{message}</p> : null}
      <TermsUnavailableNote status={termsState.status} />
      <form
        className="account-acceptance-form"
        action={acceptAccountTermsPrivacy}
      >
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

function UnavailableMetadataNotice<T>({
  label,
  state,
}: Readonly<{
  label: string;
  state: AccountMetadataState<T>;
}>) {
  if (state.ok) {
    return null;
  }

  return (
    <p className="account-warning" role="status">
      {label} is unavailable: {metadataUnavailableMessage(state.reason)}
    </p>
  );
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

function formatOptionalDate(value: string | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function formatPlanState(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function metadataUnavailableMessage(reason: string) {
  switch (reason) {
    case "invalid_input":
      return "metadata did not pass account consistency checks.";
    case "missing_metadata":
      return "required account metadata has not been created yet.";
    case "missing_user":
      return "a signed-in account is required.";
    default:
      return "server-only account services are not configured or are temporarily unavailable.";
  }
}

function resolvePlanStatusClassName(planState: string | undefined) {
  if (planState === "paid_active" || planState === "friend_of_ruby_active") {
    return "status-panel account-status account-status-success";
  }

  if (planState === "payment_failed" || planState === "subscription_required") {
    return "status-panel account-status account-status-required";
  }

  return "status-panel account-status";
}
