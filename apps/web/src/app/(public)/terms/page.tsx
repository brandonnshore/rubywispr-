import Link from "next/link";

const supportGuidelines = [
  "Use RubyWhisper for personal dictation into apps where you can type.",
  "Do not use the beta for meeting transcription, surveillance, regulated records, or high-risk workflows that require guaranteed uptime.",
  "Keep your account credentials private and use RubyWhisper only on Macs and accounts you are allowed to use.",
];

const releaseLimitations = [
  "RubyWhisper is a Mac-only beta and may change, pause, or become unavailable while launch work continues.",
  "The beta depends on account, network, billing, entitlement, and transcription provider availability.",
  "The Mac app may show recovery states when insertion cannot complete; local Recent Wisprs are handled on the Mac, not in the web account.",
];

const termsRoutes = [
  {
    href: "/privacy",
    label: "Privacy",
    note: "Review what RubyWhisper does and does not keep.",
  },
  {
    href: "/support",
    label: "Support",
    note: "Get beta help without sending private dictation content.",
  },
  {
    href: "/account",
    label: "Account",
    note: "Sign in to accept Terms and Privacy before trial dictation.",
  },
  {
    href: "/pricing",
    label: "Pricing",
    note: "Compare the free trial and paid beta plans.",
  },
  {
    href: "/download",
    label: "Download",
    note: "Check Mac beta artifact availability.",
  },
];

export default function TermsPage() {
  return (
    <main className="surface-shell public-shell terms-shell">
      <section
        className="surface-panel public-panel terms-panel"
        aria-labelledby="terms-heading"
      >
        <header className="route-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/">Home</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/support">Support</Link>
            <Link href="/account">Account</Link>
          </nav>
        </header>

        <div className="terms-hero">
          <div>
            <p className="surface-kicker">Terms</p>
            <h1 id="terms-heading">RubyWhisper beta terms.</h1>
          </div>
          <p className="surface-copy terms-hero-copy">
            These terms describe the current RubyWhisper beta in plain language.
            They are product guidance for beta use, not a substitute for formal
            legal review.
          </p>
        </div>

        <section className="terms-callout" aria-labelledby="acceptance-heading">
          <div>
            <p className="account-status-label">Before dictation</p>
            <h2 id="acceptance-heading">Accept Terms and Privacy in account.</h2>
          </div>
          <p>
            RubyWhisper requires a signed-in account and Terms/Privacy
            acceptance before trial dictation. The account system records
            acceptance timestamp metadata for the signed-in profile. It does
            not save the policy copy as the acceptance record.
          </p>
          <Link className="rw-button" href="/account">
            Go to account acceptance
          </Link>
        </section>

        <div className="terms-section-grid">
          <section className="terms-section" aria-labelledby="beta-heading">
            <p className="surface-kicker">Beta access</p>
            <h2 id="beta-heading">RubyWhisper is still a beta.</h2>
            <p>
              The current release is intended for invited or self-serve beta
              users who understand that features, limits, pricing, packaging,
              and availability can change before a wider production launch.
            </p>
          </section>

          <section className="terms-section" aria-labelledby="plans-heading">
            <p className="surface-kicker">Trial and paid plans</p>
            <h2 id="plans-heading">The trial belongs to your account.</h2>
            <p>
              New authenticated accounts start with a 5,000-word trial. Trial
              usage is counted from final dictation output for account and plan
              decisions. Paid plans are available when the trial is no longer
              enough for your personal Mac dictation workflow.
            </p>
            <Link className="route-text-link" href="/pricing">
              View pricing
            </Link>
          </section>

          <section className="terms-section" aria-labelledby="privacy-heading">
            <p className="surface-kicker">Privacy fit</p>
            <h2 id="privacy-heading">Dictation content is transient server-side.</h2>
            <p>
              RubyWhisper sends recorded audio through the backend for
              transcription and optional cleanup, then returns text to the Mac.
              The server contract is metadata-only for account, usage, request,
              plan, and acceptance records. RubyWhisper does not keep
              server-side audio, transcript, cleaned text, clipboard, prompt,
              provider payload, or local history content.
            </p>
            <Link className="route-text-link" href="/privacy">
              Read privacy details
            </Link>
          </section>

          <section className="terms-section" aria-labelledby="support-heading">
            <p className="surface-kicker">Support</p>
            <h2 id="support-heading">Support is beta support.</h2>
            <p>
              Support can help with account, billing, download, and beta access
              questions as capacity allows. Do not include private dictation
              text, audio, transcripts, clipboard content, prompts, or provider
              request and response payloads in support requests.
            </p>
            <Link className="route-text-link" href="/support">
              Open support
            </Link>
          </section>
        </div>

        <section className="terms-list-section" aria-labelledby="use-heading">
          <div>
            <p className="surface-kicker">Acceptable use</p>
            <h2 id="use-heading">Use RubyWhisper for personal dictation.</h2>
          </div>
          <ul>
            {supportGuidelines.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="terms-list-section" aria-labelledby="limits-heading">
          <div>
            <p className="surface-kicker">Current limits</p>
            <h2 id="limits-heading">Do not depend on production availability.</h2>
          </div>
          <ul>
            {releaseLimitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <nav className="route-list terms-route-list" aria-label="Terms links">
          {termsRoutes.map((route) => (
            <a className="route-link" href={route.href} key={route.href}>
              <span>{route.label}</span>
              <small>{route.note}</small>
            </a>
          ))}
        </nav>
      </section>
    </main>
  );
}
