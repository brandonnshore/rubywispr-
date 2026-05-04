import Link from "next/link";

import { requireRubyWhisperAdminForPage } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adminAuthorization = await requireRubyWhisperAdminForPage();

  if (!adminAuthorization.ok) {
    return <AdminAccessDenied />;
  }

  return (
    <main className="surface-shell admin-shell">
      <section
        className="surface-panel admin-panel"
        aria-labelledby="admin-heading"
      >
        <header className="admin-heading">
          <div>
            <p className="surface-kicker">Admin</p>
            <h1 id="admin-heading">Admin operations</h1>
          </div>
          <Link className="route-text-link" href="/">
            Public site
          </Link>
        </header>
        <p className="surface-copy admin-copy">
          Server-side admin authorization is active. Dashboard data tables are
          intentionally deferred; this shell exposes no user, usage,
          transcript, audio, or private operational data.
        </p>
        <div
          className="admin-status-grid"
          aria-label="Admin dashboard placeholders"
        >
          <section className="status-panel admin-status-card">
            <p className="account-status-label">Access</p>
            <h2>Active admin role</h2>
            <p>Role verification completed on the server before rendering.</p>
          </section>
          <section className="status-panel admin-status-card">
            <p className="account-status-label">Dashboard</p>
            <h2>Tables pending</h2>
            <p>
              Users, plans, usage, errors, and invite codes remain out of
              scope.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}

function AdminAccessDenied() {
  return (
    <main className="surface-shell admin-shell admin-denied-shell">
      <section
        className="surface-panel admin-panel admin-denied-panel"
        aria-labelledby="admin-denied-heading"
      >
        <p className="surface-kicker">Admin authorization</p>
        <h1 id="admin-denied-heading">Admin access denied</h1>
        <p className="surface-copy admin-copy">
          This signed-in account does not have an active RubyWhisper admin role.
        </p>
        <section
          className="status-panel admin-denied-state"
          aria-label="Admin denied state"
        >
          <p className="account-status-label">Unauthorized</p>
          <h2>No admin console access</h2>
          <p>
            The protected admin surface stays closed unless the server-side role
            check returns an active RubyWhisper admin authorization.
          </p>
        </section>
      </section>
    </main>
  );
}
