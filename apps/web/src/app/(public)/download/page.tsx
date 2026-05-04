import Link from "next/link";

import { clientEnv } from "@/config/client";

const supportEmail = "brandon@rubyadvisory.com";

const platformExpectations = [
  "RubyWhisper is Mac-only for the v0.1 beta.",
  "The beta requires a RubyWhisper account before trial transcription.",
  "Audio and transcript content are not stored on RubyWhisper servers.",
];

const nextSteps = [
  {
    href: "/account",
    label: "Go to account",
    note: "Check account, billing, and Terms/Privacy readiness.",
  },
  {
    href: "/pricing",
    label: "View pricing",
    note: "Review the launch trial and paid beta plan.",
  },
  {
    href: "/terms",
    label: "Read Terms",
    note: "Review beta usage and acceptance language before trial dictation.",
  },
  {
    href: "/privacy",
    label: "Read Privacy",
    note: "Confirm metadata-only server records and local Recent Wisprs.",
  },
  {
    href: "/support",
    label: "Open support",
    note: "Get beta help without sending private dictation text.",
  },
  {
    href: `mailto:${supportEmail}`,
    label: "Email support",
    note: "Contact support after reviewing privacy-safe support guidance.",
  },
];

export default function DownloadPage() {
  const latestDownloadUrl = clientEnv.latestAppDownloadUrl;

  return (
    <main className="surface-shell public-shell download-shell">
      <section
        className="surface-panel public-panel download-panel"
        aria-labelledby="download-heading"
      >
        <header className="route-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/">Home</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/account">Account</Link>
            <Link href="/support">Support</Link>
          </nav>
        </header>

        <div className="download-hero">
          <div>
            <p className="surface-kicker">Download</p>
            <h1 id="download-heading">RubyWhisper for Mac beta.</h1>
          </div>
          <p className="surface-copy download-hero-copy">
            RubyWhisper is a direct-download Mac app. The beta artifact will be
            linked here when release hosting is configured.
          </p>
        </div>

        {latestDownloadUrl ? (
          <section
            className="status-panel download-status download-status-ready"
            aria-labelledby="download-ready-heading"
          >
            <p className="account-status-label">Available</p>
            <h2 id="download-ready-heading">Download the latest Mac beta</h2>
            <p>
              Use this direct download when you are ready to install
              RubyWhisper on a supported Mac. Keep your account available for
              sign-in, Terms/Privacy acceptance, and billing state.
            </p>
            <a
              className="rw-button"
              href={latestDownloadUrl}
              rel="noopener noreferrer"
            >
              Download RubyWhisper Mac beta
            </a>
          </section>
        ) : (
          <section
            className="status-panel download-status download-status-placeholder"
            aria-labelledby="download-placeholder-heading"
          >
            <p className="account-status-label">Beta artifact pending</p>
            <h2 id="download-placeholder-heading">
              The beta app download is not available yet.
            </h2>
            <p>
              RubyWhisper is not publishing a public Mac artifact from this
              page until release hosting is ready. This placeholder avoids
              local file paths, private URLs, and claims about signing or
              notarization that belong to later release work.
            </p>
            <div className="cta-row" aria-label="Download placeholder actions">
              <Link className="rw-button" href="/account">
                Go to account
              </Link>
              <Link className="rw-button rw-button-secondary" href="/pricing">
                View pricing
              </Link>
            </div>
          </section>
        )}

        <section
          className="download-details"
          aria-labelledby="download-expectations-heading"
        >
          <div>
            <p className="surface-kicker">Platform</p>
            <h2 id="download-expectations-heading">What to expect</h2>
          </div>
          <ul>
            {platformExpectations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <nav className="route-list download-route-list" aria-label="Next steps">
          {nextSteps.map((step) => (
            <a className="route-link" href={step.href} key={step.href}>
              <span>{step.label}</span>
              <small>{step.note}</small>
            </a>
          ))}
        </nav>
      </section>
    </main>
  );
}
