import { requireRubyWhisperAdminForPage } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adminAuthorization = await requireRubyWhisperAdminForPage();

  if (!adminAuthorization.ok) {
    return <AdminAccessDenied />;
  }

  return (
    <main className="surface-shell">
      <section className="surface-panel" aria-labelledby="admin-heading">
        <p className="surface-kicker">Admin</p>
        <h1 id="admin-heading">Admin route placeholder</h1>
        <p className="surface-copy">
          This area will hold server-side admin workflows after the admin role
          model exists. It does not expose user, usage, transcript, audio, or
          private operational data.
        </p>
      </section>
    </main>
  );
}

function AdminAccessDenied() {
  return (
    <main className="surface-shell">
      <section className="surface-panel" aria-labelledby="admin-denied-heading">
        <p className="surface-kicker">Admin</p>
        <h1 id="admin-denied-heading">Admin access denied</h1>
        <p className="surface-copy">
          This signed-in account does not have an active RubyWhisper admin role.
        </p>
      </section>
    </main>
  );
}
