import { requireClerkUserIdForPage } from "@/lib/auth/clerk";

export default async function AccountPage() {
  await requireClerkUserIdForPage();

  return (
    <main className="surface-shell">
      <section className="surface-panel" aria-labelledby="account-heading">
        <p className="surface-kicker">Account</p>
        <h1 id="account-heading">Account route placeholder</h1>
        <p className="surface-copy">
          This area will hold customer account, plan, usage, billing, and
          download entry points after Clerk and billing work lands. It does not
          read session data or service credentials.
        </p>
      </section>
    </main>
  );
}
