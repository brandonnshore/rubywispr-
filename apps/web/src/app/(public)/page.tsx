const routeAreas = [
  {
    href: "/sign-in",
    label: "Sign in",
    owner: "Email link entry point for returning RubyWhisper users.",
  },
  {
    href: "/sign-up",
    label: "Sign up",
    owner: "Email link account creation for new RubyWhisper users.",
  },
  {
    href: "/account",
    label: "Account",
    owner: "Future Clerk-protected customer account surface.",
  },
  {
    href: "/admin",
    label: "Admin",
    owner: "Future server-side admin operations surface.",
  },
  {
    href: "/api/status",
    label: "API status",
    owner: "Deterministic backend route wiring check.",
  },
];

export default function PublicHome() {
  return (
    <main className="surface-shell">
      <section className="surface-panel" aria-labelledby="public-heading">
        <p className="surface-kicker">Public</p>
        <h1 id="public-heading">RubyWhisper web route skeleton</h1>
        <p className="surface-copy">
          This placeholder marks the public marketing surface for the
          RubyWhisper web app. Auth, billing, transcription, and launch copy
          are intentionally out of scope for this route skeleton.
        </p>

        <nav className="route-list" aria-label="RubyWhisper placeholder routes">
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
