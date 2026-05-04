import Link from "next/link";

const supportEmail = "brandon@rubyadvisory.com";

const howItWorksSteps = [
  {
    title: "Place your cursor",
    copy: "Start in Notes, Mail, a browser, an editor, or any app where you were already writing.",
  },
  {
    title: "Hold the hotkey",
    copy: "RubyWhisper shows a compact recording island with live voice pickup, then transcribes when you stop.",
  },
  {
    title: "Keep writing",
    copy: "The cleaned text lands in the active app, with Recent Wisprs kept locally on your Mac for recovery.",
  },
];

const proofMetrics = [
  ["Input", "Fn hold"],
  ["State", "Recording"],
  ["Output", "Cleaned text"],
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
    href: "/api/status",
    label: "System status",
    owner: "Check the public health endpoint before trying a beta workflow.",
  },
];

export default function PublicHome() {
  return (
    <main className="surface-shell public-shell marketing-home">
      <section
        className="surface-panel public-panel marketing-home-panel"
        aria-labelledby="public-heading"
      >
        <header className="route-header marketing-home-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/download">Download</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-up">Sign up</Link>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/account">Account</Link>
          </nav>
        </header>

        <section className="marketing-hero" aria-label="RubyWhisper overview">
          <div className="marketing-hero-copy">
            <p className="surface-kicker">Mac dictation</p>
            <h1 id="public-heading">RubyWhisper</h1>
            <p className="surface-offer marketing-offer">
              Fast Mac dictation that works anywhere you can type.
            </p>
            <p className="surface-copy public-copy">
              Hold a hotkey, speak, and keep writing. RubyWhisper is being
              shaped as a native-feeling Mac utility for quick dictation,
              conservative cleanup, and recovery when insertion needs a backup.
            </p>

            <div className="cta-row" aria-label="RubyWhisper actions">
              <Link className="rw-button" href="/download">
                Check beta download
              </Link>
              <Link className="rw-button rw-button-secondary" href="/pricing">
                View pricing
              </Link>
            </div>
          </div>

          <ProductProof />
        </section>

        <section className="marketing-section" aria-labelledby="works-heading">
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

        <section className="marketing-proof-band" aria-labelledby="proof-heading">
          <div>
            <p className="surface-kicker">Product proof</p>
            <h2 id="proof-heading">Built around the recording island.</h2>
          </div>
          <p>
            The signature surface is compact, visible, and focused on the
            state that matters: listening, processing, success, or recovery.
            It is product proof, not a generic dashboard decoration.
          </p>
        </section>

        <section
          className="marketing-section marketing-privacy"
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

        <section className="marketing-pricing" aria-labelledby="pricing-heading">
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

        <section className="marketing-section" aria-labelledby="routes-heading">
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
              <span>Support</span>
              <small>
                Email beta questions without sending private dictation text.
              </small>
            </a>
          </nav>
        </section>
      </section>
    </main>
  );
}

function ProductProof() {
  return (
    <aside className="product-proof" aria-label="RubyWhisper dictation preview">
      <div className="product-proof-window">
        <div className="product-proof-toolbar" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="product-proof-document">
          <p className="product-proof-app">Notes</p>
          <h2>Launch plan notes</h2>
          <p>
            RubyWhisper should feel instant: speak into the Mac, keep focus in
            the writing surface, and insert clean text without a detour.
          </p>
          <p className="product-proof-output">
            The finished text appears where the cursor was already waiting.
          </p>
        </div>
      </div>

      <div className="recording-island" aria-label="Recording island preview">
        <div>
          <p>RubyWhisper</p>
          <strong>Listening</strong>
        </div>
        <div className="voice-meter" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <dl className="product-proof-metrics">
        {proofMetrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
