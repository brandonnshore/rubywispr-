import Link from "next/link";

const supportEmail = "brandon@rubyadvisory.com";

const safeSupportDetails = [
  "Account email or the email you used to sign in.",
  "Plan state, such as trial, monthly, annual, paid active, or payment failed.",
  "Safe error code and request ID shown by the app or account surface.",
  "RubyWhisper app version and macOS version.",
  "A rough workflow description, such as the app you were typing into and what step failed.",
];

const privateSupportContent = [
  "Private dictation text, raw transcripts, cleaned text, or local Recent Wisprs.",
  "Audio files, recording contents, or exported audio.",
  "Clipboard contents, surrounding app context, prompts, or personal dictionary terms.",
  "Provider request payloads, provider response payloads, auth tokens, or secrets.",
  "Screenshots that show private text unless you intentionally choose to share them.",
];

const supportRoutes = [
  {
    href: "/terms",
    label: "Terms",
    note: "Review beta usage, limits, and acceptance language.",
  },
  {
    href: "/privacy",
    label: "Privacy",
    note: "See the metadata-only server contract.",
  },
  {
    href: "/account",
    label: "Account",
    note: "Check account, plan, usage, billing, and acceptance state.",
  },
  {
    href: "/download",
    label: "Download",
    note: "Check Mac beta artifact availability.",
  },
  {
    href: "/pricing",
    label: "Pricing",
    note: "Compare the trial and paid beta plan.",
  },
];

export default function SupportPage() {
  return (
    <main className="surface-shell public-shell terms-shell support-shell">
      <section
        className="surface-panel public-panel terms-panel support-panel"
        aria-labelledby="support-heading"
      >
        <header className="route-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/account">Account</Link>
          </nav>
        </header>

        <div className="terms-hero">
          <div>
            <p className="surface-kicker">Beta support</p>
            <h1 id="support-heading">RubyWhisper support.</h1>
          </div>
          <p className="surface-copy terms-hero-copy">
            Email beta support for account, billing, download, plan, and app
            workflow questions. Keep support requests metadata-only by default.
          </p>
        </div>

        <section className="terms-callout" aria-labelledby="contact-heading">
          <div>
            <p className="account-status-label">Contact path</p>
            <h2 id="contact-heading">Email beta support without private content.</h2>
          </div>
          <p>
            Use the support email path for beta help. Include metadata that lets
            RubyWhisper identify the account, plan state, request, app version,
            operating system, and rough step that failed without exposing what
            you dictated.
          </p>
          <a className="rw-button" href={`mailto:${supportEmail}`}>
            Email support
          </a>
        </section>

        <div className="terms-section-grid">
          <section className="terms-section" aria-labelledby="safe-heading">
            <p className="surface-kicker">What helps</p>
            <h2 id="safe-heading">Metadata is usually enough.</h2>
            <p>
              Support can investigate many beta issues from account and request
              metadata. Useful details include account email, plan state, error
              code, request ID, app version, OS version, and rough workflow
              context.
            </p>
          </section>

          <section className="terms-section" aria-labelledby="private-heading">
            <p className="surface-kicker">What to keep out</p>
            <h2 id="private-heading">Do not include private dictation by default.</h2>
            <p>
              Do not include dictation content, audio files, transcripts,
              clipboard contents, prompts, provider payloads, or screenshots
              with private text unless you intentionally choose to share them.
            </p>
          </section>

          <section className="terms-section" aria-labelledby="account-heading">
            <p className="surface-kicker">Account checks</p>
            <h2 id="account-heading">Start with your account and plan state.</h2>
            <p>
              The account page shows signed-in account state, Terms/Privacy
              acceptance, trial and paid plan metadata, billing entry points,
              and download readiness without displaying dictation content.
            </p>
            <Link className="route-text-link" href="/account">
              Open account
            </Link>
          </section>

          <section className="terms-section" aria-labelledby="download-heading">
            <p className="surface-kicker">Mac beta</p>
            <h2 id="download-heading">Check the download and pricing pages.</h2>
            <p>
              Download and pricing routes describe current Mac beta artifact
              availability, trial words, paid beta plans, and launch limits
              before you write in.
            </p>
            <Link className="route-text-link" href="/download">
              Open download
            </Link>
          </section>
        </div>

        <section className="terms-list-section" aria-labelledby="include-heading">
          <div>
            <p className="surface-kicker">Include</p>
            <h2 id="include-heading">Safe troubleshooting details.</h2>
          </div>
          <ul>
            {safeSupportDetails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="terms-list-section" aria-labelledby="exclude-heading">
          <div>
            <p className="surface-kicker">Do not include by default</p>
            <h2 id="exclude-heading">Private content is not needed for most support.</h2>
          </div>
          <ul>
            {privateSupportContent.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <nav className="route-list terms-route-list" aria-label="Support links">
          {supportRoutes.map((route) => (
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
