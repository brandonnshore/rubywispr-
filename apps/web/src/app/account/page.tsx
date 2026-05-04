import { requireClerkUserIdForPage } from "@/lib/auth/clerk";

import { acceptAccountTermsPrivacy } from "./actions";
import {
  readAccountTermsAcceptanceState,
  type AccountTermsAcceptanceState,
} from "./terms-acceptance";

export const dynamic = "force-dynamic";

type AccountPageProps = Readonly<{
  searchParams?: Promise<
    Readonly<{
      terms?: string | string[];
    }>
  >;
}>;

export default async function AccountPage({ searchParams }: AccountPageProps) {
  await requireClerkUserIdForPage();

  const [termsState, termsMessage] = await Promise.all([
    readAccountTermsAcceptanceState(),
    resolveTermsMessage(searchParams),
  ]);

  return (
    <main className="surface-shell">
      <section
        className="surface-panel account-panel"
        aria-labelledby="account-heading"
      >
        <p className="surface-kicker">Account</p>
        <h1 id="account-heading">Account</h1>
        <p className="surface-copy">
          Terms and Privacy acceptance is required before RubyWhisper can
          transcribe trial dictation. This account view records only acceptance
          metadata for the signed-in session.
        </p>
        <TermsAcceptanceSection
          message={termsMessage}
          termsState={termsState}
        />
      </section>
    </main>
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
      <section className="account-status" aria-labelledby="terms-heading">
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
      className="account-status account-status-required"
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
