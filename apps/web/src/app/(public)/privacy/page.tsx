import Link from "next/link";

const supportEmail = "brandon@rubyadvisory.com";

const storedMetadata = [
  "Account profile metadata such as Clerk user ID, email, Terms/Privacy acceptance timestamp, and account status.",
  "Aggregate usage counters such as trial words used, lifetime words used, monthly words used, monthly period start, and update timestamps.",
  "Stripe billing metadata and cache state such as customer, subscription, plan, status, renewal, and webhook idempotency fields needed for account and billing decisions.",
  "Request and error metadata such as request IDs, provider names, duration, word count, latency, app version, OS version, status, and safe error codes.",
];

const neverStoredContent = [
  "Audio payloads, audio files, or recording contents.",
  "Raw transcripts, cleaned text, cleanup prompts, provider request bodies, or provider response bodies.",
  "Clipboard content, surrounding app context, screenshots, personal dictionary terms, or local Recent Wisprs.",
  "Private env values, auth tokens, magic links, card numbers, or secrets.",
];

const privacyRoutes = [
  {
    href: "/terms",
    label: "Terms",
    note: "Read the beta usage and acceptance terms.",
  },
  {
    href: "/support",
    label: "Support",
    note: "Get beta help without sending private dictation content.",
  },
  {
    href: "/account",
    label: "Account",
    note: "Review account, billing, usage, and acceptance metadata.",
  },
  {
    href: "/pricing",
    label: "Pricing",
    note: "Compare the trial and paid beta plan.",
  },
  {
    href: "/download",
    label: "Download",
    note: "Check Mac beta artifact availability.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="surface-shell public-shell terms-shell privacy-shell">
      <section
        className="surface-panel public-panel terms-panel privacy-panel"
        aria-labelledby="privacy-heading"
      >
        <header className="route-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/support">Support</Link>
            <Link href="/account">Account</Link>
          </nav>
        </header>

        <div className="terms-hero">
          <div>
            <p className="surface-kicker">Privacy</p>
            <h1 id="privacy-heading">RubyWhisper privacy.</h1>
          </div>
          <p className="surface-copy terms-hero-copy">
            RubyWhisper is built around transient dictation processing and
            metadata-only account records. This page describes the current beta
            product behavior, not a formal compliance certification.
          </p>
        </div>

        <section className="terms-callout" aria-labelledby="storage-heading">
          <div>
            <p className="account-status-label">Server storage</p>
            <h2 id="storage-heading">Dictation content is not kept server-side.</h2>
          </div>
          <p>
            RubyWhisper servers do not store audio, raw transcripts, cleaned
            text, clipboard content, app context, prompts, provider payloads, or
            local Recent Wisprs. The server contract is metadata-only for
            account, usage, request, billing, support, and admin operations.
          </p>
          <Link className="rw-button" href="/terms">
            Read beta terms
          </Link>
        </section>

        <div className="terms-section-grid">
          <section className="terms-section" aria-labelledby="processing-heading">
            <p className="surface-kicker">Transient processing</p>
            <h2 id="processing-heading">
              Audio and text pass through only to complete a request.
            </h2>
            <p>
              When you dictate, the Mac sends recorded audio to the RubyWhisper
              backend. The backend authenticates the account, checks
              Terms/Privacy acceptance, plan, quota, rate limits, and duration,
              then sends the needed request content to transcription and cleanup
              providers. The final text is returned to the Mac, and RubyWhisper
              does not persist the audio, transcript, cleanup prompt, provider
              payload, or final text as a server record.
            </p>
          </section>

          <section className="terms-section" aria-labelledby="local-heading">
            <p className="surface-kicker">Local Recent Wisprs</p>
            <h2 id="local-heading">Recent Wisprs stay on your Mac.</h2>
            <p>
              Recent Wisprs are local recovery history for successful or failed
              insertions. They may include final cleaned text on the Mac, expire
              after 7 days by default, and can be disabled or cleared in local
              app settings. RubyWhisper web, support, and admin surfaces do not
              upload, display, or store local Recent Wisprs.
            </p>
          </section>

          <section className="terms-section" aria-labelledby="metadata-heading">
            <p className="surface-kicker">Persisted metadata</p>
            <h2 id="metadata-heading">
              Account, usage, and billing records are metadata.
            </h2>
            <p>
              RubyWhisper stores only the metadata needed to run the beta:
              account identity, Terms/Privacy acceptance, plan state, aggregate
              usage counters, billing cache state, request IDs, timestamps,
              provider names, duration, word counts, latency, status, and safe
              error codes. Word counts are aggregate usage metadata and must not
              reveal the underlying dictation content.
            </p>
            <Link className="route-text-link" href="/account">
              Open account
            </Link>
          </section>

          <section className="terms-section" aria-labelledby="support-heading">
            <p className="surface-kicker">Support and admin</p>
            <h2 id="support-heading">Support should not need private dictation.</h2>
            <p>
              Beta support can help with account, billing, download, plan,
              request ID, and safe error-code questions. Support and admin
              operations should never see transcript, audio, clipboard, prompt,
              app context, dictionary, provider request, provider response, or
              Recent Wisprs content. Do not include private dictation content in
              support email.
            </p>
            <a className="route-text-link" href={`mailto:${supportEmail}`}>
              Email support
            </a>
          </section>
        </div>

        <section className="terms-list-section" aria-labelledby="kept-heading">
          <div>
            <p className="surface-kicker">What may be stored</p>
            <h2 id="kept-heading">Metadata that keeps the beta running.</h2>
          </div>
          <ul>
            {storedMetadata.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="terms-list-section" aria-labelledby="never-heading">
          <div>
            <p className="surface-kicker">What is not stored</p>
            <h2 id="never-heading">Private dictation content is excluded.</h2>
          </div>
          <ul>
            {neverStoredContent.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <nav className="route-list terms-route-list" aria-label="Privacy links">
          {privacyRoutes.map((route) => (
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
