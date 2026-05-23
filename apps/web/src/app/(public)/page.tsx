import Link from "next/link";
import Image from "next/image";

const supportEmail = "brandon@rubyadvisory.com";

const howItWorksSteps = [
  {
    title: "Put the cursor where the text should land.",
    copy: "Start in Notes, Mail, a browser, an editor, or any app where you were already writing.",
  },
  {
    title: "Hold Fn and speak naturally.",
    copy: "RubyWhisper keeps the recording island compact, visible, and focused on the current state.",
  },
  {
    title: "Keep writing when the text appears.",
    copy: "Cleaned text lands in the active app, with Recent Wisprs kept locally on your Mac for recovery.",
  },
];

const featureCards = [
  {
    accent: "ruby",
    label: "Push to talk",
    title: "Hold Fn, talk, release.",
    copy: "A fast recording loop for the tiny bursts of writing you do all day.",
  },
  {
    accent: "amber",
    label: "Local recovery",
    title: "Recent Wisprs stay on the Mac.",
    copy: "If insertion needs backup, recovery happens locally instead of exposing private dictation in admin tools.",
  },
  {
    accent: "blue",
    label: "Conservative cleanup",
    title: "Polished text, not rewritten personality.",
    copy: "RubyWhisper cleans dictation lightly so the result still sounds like you.",
  },
];

const integrationTargets = [
  "Notes",
  "Mail",
  "Messages",
  "Chrome",
  "Cursor",
  "Slack",
  "Linear",
  "Docs",
];

const routeAreas = [
  {
    href: "/download",
    label: "Download",
    owner: "Check the Mac beta artifact status and platform expectations.",
  },
  {
    href: "/pricing",
    label: "Pricing",
    owner: "Review the 5,000-word trial and simple launch plans.",
  },
  {
    href: "/sign-up",
    label: "Sign up",
    owner: "Create an account for beta access, terms, and billing state.",
  },
  {
    href: "/sign-in",
    label: "Sign in",
    owner: "Return to your account when you already have beta access.",
  },
  {
    href: "/account",
    label: "Account",
    owner: "Manage terms, billing actions, support, and download readiness.",
  },
  {
    href: "/privacy",
    label: "Privacy",
    owner: "Understand metadata-only server records and local Recent Wisprs.",
  },
  {
    href: "/terms",
    label: "Terms",
    owner: "Review beta usage, limits, and account acceptance language.",
  },
  {
    href: "/support",
    label: "Support",
    owner: "Get beta help without sending private dictation text.",
  },
  {
    href: "/api/status",
    label: "System status",
    owner: "Check the public health endpoint before trying a beta workflow.",
  },
];

export default function PublicHome() {
  return (
    <main className="surface-shell public-shell marketing-home">
      <section
        className="surface-panel public-panel marketing-home-panel rw-reveal"
        aria-labelledby="public-heading"
      >
        <MarketingNav />

        <section className="marketing-hero" aria-label="RubyWhisper overview">
          <div className="marketing-hero-copy rw-reveal">
            <p className="surface-kicker">Mac dictation</p>
            <h1 id="public-heading">
              Just speak.
              <span>Write faster.</span>
            </h1>
            <p className="surface-offer marketing-offer">
              Turn your voice into polished text.
            </p>
            <p className="surface-copy public-copy">
              RubyWhisper works anywhere you can type. Hold a hotkey, speak,
              and keep writing while clean text lands where your cursor was
              already waiting.
            </p>

            <div className="cta-row" aria-label="RubyWhisper actions">
              <Link
                aria-label="Check beta download"
                className="rw-button"
                href="/download"
              >
                <span>Download for Mac</span>
                <span aria-hidden="true" className="rw-button-icon">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M6 1v8m0 0 3-3m-3 3L3 6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </span>
              </Link>
              <Link className="rw-button rw-button-secondary" href="/pricing">
                View pricing
              </Link>
            </div>

            <p className="hero-footnote">
              5,000 trial words. Metadata-only server records. Mac-only beta.
            </p>
          </div>

          <ProductProof />
        </section>

        <section
          className="marketing-section marketing-logos rw-scroll-reveal"
          aria-labelledby="used-heading"
        >
          <div className="marketing-section-heading">
            <p className="surface-kicker">Built for motion</p>
            <h2 id="used-heading">For people who write while moving fast.</h2>
          </div>
          <div className="trust-grid" aria-label="RubyWhisper workflow targets">
            {integrationTargets.map((target) => (
              <span key={target}>{target}</span>
            ))}
          </div>
        </section>

        <section
          className="marketing-section rw-scroll-reveal"
          aria-labelledby="works-heading"
        >
          <div className="marketing-section-heading">
            <p className="surface-kicker">How it works</p>
            <h2 id="works-heading">Dictate without leaving the app you are in.</h2>
          </div>
          <div className="marketing-step-grid">
            {howItWorksSteps.map((step, index) => (
              <article className="marketing-step" key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="marketing-feature-stack rw-scroll-reveal"
          aria-labelledby="inside-heading"
        >
          <div className="marketing-section-heading">
            <p className="surface-kicker">What is inside</p>
            <h2 id="inside-heading">Powerful features, quietly integrated.</h2>
          </div>
          <div className="feature-card-grid">
            {featureCards.map((feature) => (
              <article
                className={`feature-card feature-card-${feature.accent}`}
                key={feature.title}
              >
                <p>{feature.label}</p>
                <h3>{feature.title}</h3>
                <span>{feature.copy}</span>
              </article>
            ))}
          </div>
        </section>

        <section
          className="marketing-proof-band rw-scroll-reveal"
          aria-labelledby="proof-heading"
        >
          <div>
            <p className="surface-kicker">Product proof</p>
            <h2 id="proof-heading">Built around the recording island.</h2>
          </div>
          <p>
            The signature surface is compact, visible, and focused on the state
            that matters: listening, processing, success, or recovery. It is
            product proof, not a generic dashboard decoration.
          </p>
        </section>

        <section
          className="marketing-section marketing-privacy rw-scroll-reveal"
          aria-labelledby="privacy-heading"
        >
          <div className="marketing-section-heading">
            <p className="surface-kicker">Privacy promise</p>
            <h2 id="privacy-heading">Private dictation stays private.</h2>
          </div>
          <div className="marketing-privacy-copy">
            <p>
              Audio and transcript content are not stored on RubyWhisper
              servers. Recent Wisprs live locally on the Mac, and support
              requests should not include private dictation text.
            </p>
            <p>
              Account, plan, billing, and usage metadata support the beta, but
              admin and account surfaces are designed not to expose transcript
              or audio content.
            </p>
          </div>
        </section>

        <section
          className="marketing-pricing rw-scroll-reveal"
          aria-labelledby="pricing-heading"
        >
          <div>
            <p className="surface-kicker">Pricing</p>
            <h2 id="pricing-heading">Start with 5,000 trial words.</h2>
            <p>
              Launch pricing is simple: $7/month or $60/year, shown as
              $5/month billed annually. Provider costs are included for
              unlimited personal dictation under fair-use terms.
            </p>
          </div>
          <Link className="rw-button" href="/pricing">
            Compare plans
          </Link>
        </section>

        <section
          className="marketing-section rw-scroll-reveal"
          aria-labelledby="routes-heading"
        >
          <div className="marketing-section-heading">
            <p className="surface-kicker">Next steps</p>
            <h2 id="routes-heading">
              Download, account, pricing, status, and support.
            </h2>
          </div>
          <nav
            className="route-list marketing-route-list"
            aria-label="RubyWhisper routes"
          >
            {routeAreas.map((route) => (
              <a className="route-link" href={route.href} key={route.href}>
                <span>{route.label}</span>
                <small>{route.owner}</small>
              </a>
            ))}
            <a className="route-link" href={`mailto:${supportEmail}`}>
              <span>Email support</span>
              <small>Use email after reviewing privacy-safe support guidance.</small>
            </a>
          </nav>
        </section>
      </section>
    </main>
  );
}

function MarketingNav() {
  return (
    <header className="route-header marketing-home-header">
      <Link className="route-brand" href="/" aria-label="RubyWhisper home">
        <Image alt="" height={22} src="/rubywhisper-icon.png" width={22} />
        <span>RubyWhisper</span>
      </Link>
      <nav className="route-nav" aria-label="Primary routes">
        <Link href="/">Home</Link>
        <Link href="/download">Download</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/sign-up">Sign up</Link>
        <Link href="/support">Support</Link>
      </nav>
    </header>
  );
}

function ProductProof() {
  return (
    <aside
      className="product-proof rw-reveal"
      aria-label="RubyWhisper dictation preview"
    >
      <div className="product-proof-stage" aria-hidden="true">
        <div className="voice-profile" />
        <div className="product-window product-window-mail">
          <div className="window-controls">
            <span />
            <span />
            <span />
          </div>
          <div className="mail-line mail-line-short" />
          <div className="mail-line" />
          <div className="mail-line mail-line-soft" />
        </div>
        <div className="product-window product-window-editor">
          <div className="window-controls">
            <span />
            <span />
            <span />
          </div>
          <div className="editor-row">
            <span>fn</span>
            <i />
            <strong>ruby draft</strong>
          </div>
          <div className="editor-copy">
            Dictate the note, keep the cursor, send the cleaned text.
          </div>
        </div>
        <RecordingPill />
      </div>

      <dl className="product-proof-metrics">
        <div>
          <dt>Input</dt>
          <dd>Fn hold</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>Recording</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>Cleaned text</dd>
        </div>
      </dl>
    </aside>
  );
}

function RecordingPill() {
  return (
    <div className="product-proof-pill">
      <button
        className="product-proof-pill-cancel"
        type="button"
        aria-label="Cancel recording (demo)"
        tabIndex={-1}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1 1l8 8M9 1l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="product-proof-waveform" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, index) => (
          <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
        ))}
      </div>
      <button
        className="product-proof-pill-stop"
        type="button"
        aria-label="Stop recording (demo)"
        tabIndex={-1}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7.4 5.65 10 11 4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  );
}
