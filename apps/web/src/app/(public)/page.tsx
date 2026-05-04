import Link from "next/link";

const routeAreas = [
  {
    href: "/sign-in",
    label: "Sign in",
    owner: "Return with a browser-based email link.",
  },
  {
    href: "/sign-up",
    label: "Sign up",
    owner: "Create an account for the Mac beta.",
  },
  {
    href: "/download",
    label: "Download",
    owner: "Get the Mac beta when a safe release link is available.",
  },
  {
    href: "/pricing",
    label: "Pricing",
    owner: "Compare launch plans and start checkout.",
  },
  {
    href: "/account",
    label: "Account",
    owner: "Review terms acceptance and billing actions.",
  },
  {
    href: "/admin",
    label: "Admin",
    owner: "Protected operator surface for internal use.",
  },
  {
    href: "/api/status",
    label: "API status",
    owner: "Check the backend route wiring.",
  },
];

export default function PublicHome() {
  return (
    <main className="surface-shell public-shell">
      <section
        className="surface-panel public-panel"
        aria-labelledby="public-heading"
      >
        <header className="route-header">
          <Link className="route-brand" href="/" aria-label="RubyWhisper home">
            RubyWhisper
          </Link>
          <nav className="route-nav" aria-label="Primary routes">
            <Link href="/download">Download</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/account">Account</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>

        <p className="surface-kicker">Mac dictation</p>
        <h1 id="public-heading">RubyWhisper</h1>
        <p className="surface-offer">
          Fast Mac dictation that works anywhere you can type.
        </p>
        <p className="surface-copy public-copy">
          RubyWhisper is being shaped around native-feeling dictation, explicit
          account consent, and privacy-forward defaults: no server-side audio or
          transcript storage, with recent wisprs kept locally on the Mac.
        </p>

        <div className="cta-row" aria-label="RubyWhisper actions">
          <Link className="rw-button" href="/download">
            Download beta
          </Link>
          <Link className="rw-button rw-button-secondary" href="/pricing">
            View pricing
          </Link>
        </div>

        <nav
          className="route-list public-route-list"
          aria-label="RubyWhisper routes"
        >
          {routeAreas.map((route) => (
            <a className="route-link" href={route.href} key={route.href}>
              <span>{route.label}</span>
              <small>{route.owner}</small>
            </a>
          ))}
        </nav>
      </section>
    </main>
  );
}
