import Link from "next/link";
import type { ReactNode } from "react";

import { requireRubyWhisperAdminForPage } from "@/lib/admin/auth";
import {
  readRubyWhisperAdminDashboardSnapshot,
  type AdminDashboardFriendOfRubyBatchRow,
  type AdminDashboardProfileRow,
  type AdminDashboardRateLimitRow,
  type AdminDashboardSection,
  type AdminDashboardStripeWebhookEventRow,
  type AdminDashboardSubscriptionRow,
  type AdminDashboardTranscriptionRequestRow,
  type AdminDashboardUsageCounterRow,
  type RubyWhisperAdminDashboardSnapshot,
} from "@/lib/admin/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adminAuthorization = await requireRubyWhisperAdminForPage();

  if (!adminAuthorization.ok) {
    return <AdminAccessDenied />;
  }

  const dashboardSnapshot = await readRubyWhisperAdminDashboardSnapshot();

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
          Server-side admin authorization is active. This dashboard renders
          source metadata only: account state, plan status, aggregate usage,
          request counters, billing event status, and Friend of Ruby batches.
        </p>
        {dashboardSnapshot.ok ? (
          <AdminDashboard snapshot={dashboardSnapshot.snapshot} />
        ) : (
          <AdminDashboardUnavailable />
        )}
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

function AdminDashboard({
  snapshot,
}: Readonly<{
  snapshot: RubyWhisperAdminDashboardSnapshot;
}>) {
  return (
    <div className="admin-dashboard" aria-label="Admin metadata dashboard">
      <section className="status-panel admin-summary" aria-label="Admin summary">
        <p className="account-status-label">Access</p>
        <h2>Metadata snapshot</h2>
        <p>
          Role verification completed on the server before this metadata
          snapshot loaded. Generated {formatTimestamp(snapshot.generatedAt)}.
        </p>
        <dl className="admin-metric-grid">
          <Metric label="Accounts" value={sectionCount(snapshot.profiles)} />
          <Metric
            label="Subscriptions"
            value={sectionCount(snapshot.subscriptions)}
          />
          <Metric
            label="Request rows"
            value={sectionCount(snapshot.transcriptionRequests)}
          />
          <Metric
            label="Friend batches"
            value={sectionCount(snapshot.friendOfRubyBatches)}
          />
        </dl>
      </section>
      <ProfilesSection section={snapshot.profiles} />
      <SubscriptionsSection section={snapshot.subscriptions} />
      <UsageSection
        rateLimits={snapshot.rateLimits}
        usageCounters={snapshot.usageCounters}
      />
      <RequestsSection section={snapshot.transcriptionRequests} />
      <StripeWebhookEventsSection section={snapshot.stripeWebhookEvents} />
      <FriendOfRubyBatchesSection section={snapshot.friendOfRubyBatches} />
    </div>
  );
}

function ProfilesSection({
  section,
}: Readonly<{
  section: AdminDashboardSection<AdminDashboardProfileRow>;
}>) {
  const profiles = section.ok ? section.rows : [];
  const acceptedTerms = profiles.filter((profile) => profile.terms_accepted_at)
    .length;
  const blocked = profiles.filter((profile) => profile.is_blocked).length;

  return (
    <DashboardSection
      heading="User and account metadata"
      label="Accounts"
      section={section}
      summary={`${profiles.length} sampled, ${acceptedTerms} accepted terms, ${blocked} blocked.`}
    >
      <MetadataTable
        columns={["Clerk user", "Email", "Terms", "Access", "Created"]}
        emptyLabel="No account metadata rows found."
        rows={profiles.map((profile) => [
          profile.clerk_user_id,
          profile.email,
          formatTimestamp(profile.terms_accepted_at),
          profile.is_blocked ? "Blocked" : "Enabled",
          formatTimestamp(profile.created_at),
        ])}
      />
    </DashboardSection>
  );
}

function SubscriptionsSection({
  section,
}: Readonly<{
  section: AdminDashboardSection<AdminDashboardSubscriptionRow>;
}>) {
  const subscriptions = section.ok ? section.rows : [];
  const active = subscriptions.filter((subscription) =>
    ["active", "trialing"].includes(subscription.status),
  ).length;
  const attention = subscriptions.filter((subscription) =>
    ["incomplete", "past_due", "unpaid"].includes(subscription.status),
  ).length;

  return (
    <DashboardSection
      heading="Plan and subscription status"
      label="Plans"
      section={section}
      summary={`${subscriptions.length} sampled, ${active} active/trialing, ${attention} need billing attention.`}
    >
      <MetadataTable
        columns={["Clerk user", "Plan", "Status", "Period end", "Friend until"]}
        emptyLabel="No subscription cache rows found."
        rows={subscriptions.map((subscription) => [
          subscription.clerk_user_id,
          formatState(subscription.plan),
          formatState(subscription.status),
          formatTimestamp(subscription.current_period_end),
          formatTimestamp(subscription.friend_of_ruby_until),
        ])}
      />
    </DashboardSection>
  );
}

function UsageSection({
  rateLimits,
  usageCounters,
}: Readonly<{
  rateLimits: AdminDashboardSection<AdminDashboardRateLimitRow>;
  usageCounters: AdminDashboardSection<AdminDashboardUsageCounterRow>;
}>) {
  const counters = usageCounters.ok ? usageCounters.rows : [];
  const limits = rateLimits.ok ? rateLimits.rows : [];
  const monthlyWords = counters.reduce(
    (total, counter) => total + safeCount(counter.monthly_words_used),
    0,
  );
  const activeWindowRequests = limits.reduce(
    (total, limit) => total + safeCount(limit.request_count),
    0,
  );

  return (
    <DashboardSection
      heading="Usage counters and rate windows"
      label="Usage"
      section={usageCounters.ok ? rateLimits : usageCounters}
      summary={`${counters.length} usage rows, ${monthlyWords} monthly words, ${activeWindowRequests} active-window requests.`}
    >
      <MetadataTable
        columns={["Clerk user", "Trial words", "Monthly words", "Lifetime", "Period"]}
        emptyLabel="No usage counter rows found."
        rows={counters.map((counter) => [
          counter.clerk_user_id,
          formatCount(counter.trial_words_used),
          formatCount(counter.monthly_words_used),
          formatCount(counter.lifetime_words_used),
          counter.monthly_period_start,
        ])}
      />
      <MetadataTable
        columns={["Clerk user", "Window requests", "Window start", "Updated"]}
        emptyLabel="No rate-limit metadata rows found."
        rows={limits.map((limit) => [
          limit.clerk_user_id,
          formatCount(limit.request_count),
          formatTimestamp(limit.window_start),
          formatTimestamp(limit.updated_at),
        ])}
      />
    </DashboardSection>
  );
}

function RequestsSection({
  section,
}: Readonly<{
  section: AdminDashboardSection<AdminDashboardTranscriptionRequestRow>;
}>) {
  const requests = section.ok ? section.rows : [];
  const successes = requests.filter((request) => request.status === "success")
    .length;
  const failures = requests.filter((request) => request.status === "failure")
    .length;

  return (
    <DashboardSection
      heading="Request and error counts"
      label="Requests"
      section={section}
      summary={`${requests.length} sampled, ${successes} succeeded, ${failures} failed.`}
    >
      <MetadataTable
        columns={["Status", "Provider", "Plan state", "Words", "Latency", "Error"]}
        emptyLabel="No transcription request metadata rows found."
        rows={requests.map((request) => [
          formatState(request.status),
          formatState(request.provider),
          formatState(request.plan_state),
          formatCount(request.cleaned_word_count),
          formatMilliseconds(request.latency_ms),
          request.error_code ?? "None",
        ])}
      />
    </DashboardSection>
  );
}

function StripeWebhookEventsSection({
  section,
}: Readonly<{
  section: AdminDashboardSection<AdminDashboardStripeWebhookEventRow>;
}>) {
  const events = section.ok ? section.rows : [];
  const failed = events.filter((event) => event.status === "failed").length;
  const processing = events.filter((event) => event.status === "processing")
    .length;

  return (
    <DashboardSection
      heading="Billing webhook status"
      label="Billing"
      section={section}
      summary={`${events.length} sampled, ${failed} failed, ${processing} processing.`}
    >
      <MetadataTable
        columns={["Event type", "Status", "Stripe created", "Updated", "Error"]}
        emptyLabel="No Stripe webhook metadata rows found."
        rows={events.map((event) => [
          event.event_type,
          formatState(event.status),
          formatTimestamp(event.stripe_created_at),
          formatTimestamp(event.updated_at),
          event.error_code ?? "None",
        ])}
      />
    </DashboardSection>
  );
}

function FriendOfRubyBatchesSection({
  section,
}: Readonly<{
  section: AdminDashboardSection<AdminDashboardFriendOfRubyBatchRow>;
}>) {
  const batches = section.ok ? section.rows : [];
  const expiring = batches.filter((batch) => batch.expires_at).length;

  return (
    <DashboardSection
      heading="Friend of Ruby batches"
      label="Friend of Ruby"
      section={section}
      summary={`${batches.length} sampled, ${expiring} with expiration metadata.`}
    >
      <MetadataTable
        columns={["Code label", "Max redemptions", "Expires", "Created by", "Created"]}
        emptyLabel="No Friend of Ruby batch metadata rows found."
        rows={batches.map((batch) => [
          batch.code,
          formatCount(batch.max_redemptions),
          formatTimestamp(batch.expires_at),
          batch.created_by_clerk_user_id,
          formatTimestamp(batch.created_at),
        ])}
      />
    </DashboardSection>
  );
}

function DashboardSection<Row>({
  children,
  heading,
  label,
  section,
  summary,
}: Readonly<{
  children: ReactNode;
  heading: string;
  label: string;
  section: AdminDashboardSection<Row>;
  summary: string;
}>) {
  return (
    <section className="status-panel admin-dashboard-section">
      <p className="account-status-label">{label}</p>
      <h2>{heading}</h2>
      {section.ok ? (
        <>
          <p>{summary}</p>
          {children}
        </>
      ) : (
        <p>Metadata is unavailable for this section.</p>
      )}
    </section>
  );
}

function MetadataTable({
  columns,
  emptyLabel,
  rows,
}: Readonly<{
  columns: readonly string[];
  emptyLabel: string;
  rows: readonly (readonly string[])[];
}>) {
  if (rows.length === 0) {
    return <p className="admin-empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-metadata-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) => (
                <td key={`${columns[index] ?? "cell"}-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AdminDashboardUnavailable() {
  return (
    <section
      className="status-panel admin-dashboard-section admin-dashboard-unavailable"
      aria-label="Admin dashboard unavailable"
    >
      <p className="account-status-label">Unavailable</p>
      <h2>Dashboard metadata unavailable</h2>
      <p>
        The server-side admin authorization succeeded, but the dashboard
        metadata source could not be read. No private operational details are
        rendered.
      </p>
    </section>
  );
}

function sectionCount<Row>(section: AdminDashboardSection<Row>) {
  return section.ok ? formatCount(section.rows.length) : "Unavailable";
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "None";
  }

  return date.toISOString().slice(0, 10);
}

function formatState(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCount(value: number | null | undefined) {
  return safeCount(value).toLocaleString("en-US");
}

function formatMilliseconds(value: number | null | undefined) {
  const count = safeCount(value);

  return count ? `${count.toLocaleString("en-US")} ms` : "None";
}

function safeCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
