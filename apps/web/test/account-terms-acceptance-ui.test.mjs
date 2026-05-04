import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const accountPagePath = path.join("src", "app", "account", "page.tsx");
const accountActionsPath = path.join("src", "app", "account", "actions.ts");
const accountTermsServerPath = path.join(
  "src",
  "app",
  "account",
  "terms-acceptance.ts",
);
const acceptTermsRoutePath = path.join(
  "src",
  "app",
  "api",
  "account",
  "accept-terms",
  "route.ts",
);

test("account page renders required Terms and Privacy acceptance states", async () => {
  const source = await readFile(accountPagePath, "utf8");

  assert.match(source, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(source, /readAccountTermsAcceptanceState/);
  assert.match(source, /acceptAccountTermsPrivacy/);
  assert.match(source, /Terms and Privacy acceptance is required/);
  assert.match(source, /required before trial\s+transcription/);
  assert.match(source, /records only the acceptance timestamp/);
  assert.match(source, /status === ["']accepted["']/);
  assert.match(source, /status === ["']service_unavailable["']/);
  assert.match(source, /status === ["']profile_missing["']/);
  assert.match(source, /type=["']checkbox["']/);
  assert.match(source, /\brequired\b/);
  assert.doesNotMatch(source, /from\s+["']@\/lib\/auth\/terms-acceptance["']/);
  assert.doesNotMatch(source, /\bstored?\s+(?:audio|transcripts?)\b/i);
  assert.doesNotMatch(source, /\breview(?:ed|s)?\s+(?:audio|transcripts?)\b/i);
});

test("account acceptance server path uses RW-023A helper metadata only", async () => {
  const source = await readFile(accountTermsServerPath, "utf8");

  assert.match(source, /import\s+["']server-only["'];/);
  assert.match(source, /from\s+["']@\/lib\/auth\/terms-acceptance["']/);
  assert.match(source, /readClerkUserTermsAcceptance/);
  assert.match(source, /recordClerkUserTermsAcceptance/);
  assert.match(source, /from\s+["']@supabase\/supabase-js["']/);
  assert.match(source, /persistSession:\s*false/);
  assert.match(source, /autoRefreshToken:\s*false/);
  assert.match(source, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /\bconsole\./);
  assert.doesNotMatch(source, /\buserId\b.*NextResponse/s);
});

test("account acceptance action and API route expose sanitized outcomes", async () => {
  await access(acceptTermsRoutePath);

  const [actionSource, routeSource] = await Promise.all([
    readFile(accountActionsPath, "utf8"),
    readFile(acceptTermsRoutePath, "utf8"),
  ]);

  assert.match(actionSource, /^["']use server["'];/);
  assert.match(actionSource, /recordSignedInAccountTermsAcceptance/);
  assert.match(actionSource, /revalidatePath\(["']\/account["']\)/);
  assert.match(actionSource, /redirect\(`\/account\?terms=\$\{result\.status\}`\)/);
  assert.doesNotMatch(actionSource, /from\s+["']@\/lib\/auth\/terms-acceptance["']/);

  assert.match(routeSource, /export\s+async\s+function\s+POST\(\s*request:\s*Request\s*\)/);
  assert.match(routeSource, /terms_acknowledgement_required/);
  assert.match(routeSource, /status:\s*400/);
  assert.match(routeSource, /termsPrivacyAccepted/);
  assert.match(routeSource, /recordSignedInAccountTermsAcceptance/);
  assert.match(routeSource, /status:\s*401/);
  assert.match(routeSource, /service_unavailable["']\s*\?\s*503\s*:\s*409/);
  assert.match(routeSource, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(routeSource, /\buserId\b|\bclerkUserId\b/);
  assert.doesNotMatch(routeSource, /\bconsole\./);
});
