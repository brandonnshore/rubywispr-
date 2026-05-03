# RubyWhisper Research Log

Status: Draft
Last updated: 2026-04-30

## Research Questions

- Can RubyWhisper safely start from an open-source macOS dictation app?
- What do comparable dictation products charge and promise?
- Can RubyWhisper offer "unlimited personal dictation" at the planned price?
- Which auth/billing/database providers best fit a fast paid beta?
- What distribution/update tools are appropriate for a direct-download macOS app?
- What privacy controls must be explicit because the product handles voice and text?

## Sources Checked

| Source | Link | Used for |
| --- | --- | --- |
| FreeFlow GitHub | https://github.com/zachlatta/freeflow | Candidate fork base, license, hotkeys, Groq/context behavior. |
| Wispr Flow pricing | https://wisprflow.ai/pricing | Competitive pricing and usage limits. |
| Wispr Flow setup docs | https://docs.wisprflow.ai/articles/3152211871-setup-guide | Browser sign-in/setup expectation. |
| Wispr Flow account docs | https://docs.wisprflow.ai/articles/7339517111-manage-your-flow-account | Account requirement and local history behavior reference. |
| Superwhisper | https://superwhisper.com/ | Website/product positioning reference. |
| Groq pricing | https://groq.com/pricing | Transcription cost basis. |
| Stripe Billing pricing | https://stripe.com/billing/pricing | Subscription billing cost consideration. |
| Clerk pricing | https://clerk.com/pricing | Auth provider cost/free-tier consideration. |
| Clerk session token docs | https://clerk.com/docs/how-to/validate-session-tokens | Backend session validation direction. |
| Supabase passwordless auth docs | https://supabase.com/docs/guides/auth/auth-email-passwordless | Auth alternative reference. |
| Auth.js email provider docs | https://authjs.dev/getting-started/authentication/email | Auth alternative reference. |
| Sparkle | https://sparkle-project.org/ | Direct-download macOS auto-update. |
| Sentry sensitive data docs | https://docs.sentry.dev/platforms/javascript/guides/nextjs/data-management/sensitive-data/ | Privacy-safe crash/error reporting constraints. |

## Candidate Base Apps

### FreeFlow

Recommendation: first audit target.

Reasons:

- Native macOS/Swift direction.
- Already aligned with `Fn` hold-to-talk and `Command+Fn` toggle pattern.
- Existing Groq integration.
- Existing cleanup/context concepts.
- MIT license.
- Active project signals.

Risks:

- May assume user-provided provider key in desktop app.
- Backend-proxy architecture may require meaningful refactor.
- Rebranding may touch many Xcode/signing files.
- Need to verify insertion reliability and focus behavior.

### Fallback Candidates

Keep as references if FreeFlow fails audit:

- Dictate Anywhere: local-first macOS dictation reference.
- Handy: mature local transcription/model management reference.
- Steno: Swift/macOS, app-aware insertion and history reference.
- CustomWispr: simpler Swift baseline.
- Murmur: offline native capsule/history reference.

Do not switch without a specific FreeFlow audit failure.

## Competitive Pricing Notes

Wispr Flow currently presents:

- Free Basic with a weekly word limit.
- Pro trial.
- Pro unlimited words at a higher monthly price than RubyWhisper's planned launch price.

RubyWhisper pricing decision:

- `$7/month`.
- `$60/year`, displayed as `$5/month billed annually`.
- 5,000-word trial.
- One plan at launch.
- Friend of Ruby one-year free codes for small groups.

Implication:

- RubyWhisper can advertise unlimited personal dictation, but needs fair-use language and abuse controls because the monthly price is lower than the closest obvious competitor's unlimited plan.

## Provider Cost Notes

Groq currently lists `whisper-large-v3-turbo` around `$0.04/hour` of transcription. This makes normal personal dictation plausible inside a `$7/month` plan, but heavy/automated usage can still break unit economics.

Cost controls:

- 10-minute single-whisper cap.
- No meeting transcription in v0.1.
- No file upload transcription in v0.1.
- Rate limits and abuse detection.
- Fair-use terms.
- Usage metadata without transcript content.
- Annual plan emphasis.

## Auth Provider Notes

Decision: Clerk for launch auth.

Why:

- Fast Next.js integration.
- Good browser-based auth UX.
- Email magic-link support.
- Session/JWT validation path for backend APIs.
- Reduces need to build custom auth flows during beta.

Alternatives:

- Supabase Auth: viable, especially if minimizing vendors matters later.
- Auth.js: flexible and open-source, but more implementation/security ownership.

Launch auth mode:

- Email magic link only.
- No Google/Apple sign-in for v0.1.

## Database Notes

Decision: Supabase Postgres for product metadata.

Needed for:

- User profile mapping from Clerk user to product state.
- Stripe customer/subscription cache.
- Trial/usage counters.
- Request metadata.
- Admin roles.
- Friend of Ruby code/batch tracking.

Not used for:

- Audio.
- Raw transcripts.
- Cleaned transcripts.
- Clipboard contents.
- Context.
- Recent Wisprs.
- Personal dictionary in v0.1.

## Billing Notes

Decision: Stripe.

Use:

- Checkout.
- Monthly/annual subscriptions.
- Customer portal.
- Promotion/coupon code flow for Friend of Ruby.
- Webhooks as billing state source.

Stripe remains source of truth. Supabase stores a product-facing cache.

## Distribution Notes

Direct download first.

Required:

- Apple Developer signing.
- Notarization.
- Download page.
- Auto-update.

Recommended updater:

- Sparkle, unless FreeFlow already includes a better suitable mechanism.

Mac App Store:

- Future/later, not v0.1.

## Privacy And Security Concerns

Sensitive data:

- Audio.
- Raw transcript.
- Cleaned text.
- Surrounding context.
- Clipboard contents.
- Auth tokens.
- Payment/customer metadata.

Rules:

- Server never stores audio/transcript/context/clipboard content.
- Server logs metadata only.
- Recent Wisprs are local-only.
- Personal dictionary is local-only in v0.1.
- Context-aware cleanup is on by default after Terms/Privacy acceptance but can be disabled.
- Support/admin tooling cannot view private text content.

## Tradeoffs

Backend proxy vs desktop direct-to-Groq:

- Backend proxy wins because it protects API keys, enforces quota/subscription, enables usage tracking, and supports abuse controls.
- Tradeoff is extra latency. Mitigate with regional hosting and careful request path.

Account required vs no-signup trial:

- Account required wins because it avoids anonymous quota abuse and simplifies Clerk/Stripe state.
- Tradeoff is more friction before first dictation.

Unlimited personal dictation vs hard monthly cap:

- Unlimited personal dictation wins for product simplicity and competitive positioning.
- Tradeoff is cost exposure. Mitigate with fair-use terms and abuse controls.

Local-only history vs synced history:

- Local-only wins for privacy and v0.1 simplicity.
- Tradeoff is no cross-Mac history sync.

## Recommendation

Proceed with:

- Requirements-first specification.
- FreeFlow audit before import.
- One Next.js app for website/backend.
- Clerk auth.
- Supabase product database.
- Stripe billing.
- Groq provider path.
- Direct-download signed/notarized macOS app.
- Sparkle updater if compatible.
- Privacy-safe logging/observability.

Do not create Linear issues or start implementation until these specs are approved.
