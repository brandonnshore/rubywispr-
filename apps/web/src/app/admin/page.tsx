export default function AdminPage() {
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
