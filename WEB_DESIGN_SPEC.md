# RubyWhisper Web And App Design Spec

Status: Draft for approval
Last updated: 2026-04-30

## Design Summary

RubyWhisper should feel like a premium Apple-native utility with a simple paid-product website. The Mac app should be quiet, fast, and trustworthy. The website should make the product instantly understandable: a beautiful dictation tool that works anywhere you can type, with a clear privacy promise and simple pricing.

This spec covers both the native macOS app and the web product because the user experience spans download, auth, billing, onboarding, dictation, and account management.

## Product Personality

- Fast.
- Calm.
- Precise.
- Native.
- Trustworthy.
- Privacy-forward.
- Light, not dark.
- Useful before it is flashy.

RubyWhisper should feel more like a polished system utility than a SaaS dashboard.

## Audience And Context

Primary users:

- People who write a lot on Mac and want speech to become text anywhere they can type.
- Early beta users from Ruby Advisory's network.
- Paid users who expect consumer-grade polish despite beta status.

Use context:

- User is inside another app and does not want to switch focus.
- User expects hotkeys to be instant.
- User may dictate long thoughts and needs recovery if insertion fails.
- User cares that private text is not stored on RubyWhisper servers.

## Design References

- Superwhisper website: product clarity, polished app imagery, Apple-like presentation.
- Wispr Flow: familiar dictation flow, recovery affordances, paid-plan expectation.
- Apple macOS utilities: restrained surfaces, precise spacing, clear permission onboarding.
- FreeFlow: starting interaction/hotkey harness if audit passes.

Do not clone Superwhisper. Use it as a quality bar for directness, product proof, and polished presentation.

## Information Architecture

### Website

- Home
- Pricing
- Download
- Sign in
- Account
- Checkout
- Billing portal redirect
- Terms
- Privacy
- Support/contact
- Admin

### Mac App

- Menu bar entry
- Onboarding
- Recording island
- Main app/settings
- Recent Wisprs
- Account/Plan
- Dictionary
- Hotkeys
- Appearance
- Advanced

## Primary Surfaces

### Website Home

Purpose:

- Explain RubyWhisper quickly.
- Convert visitors to sign up/pay/download.
- Build trust around privacy and Mac-native behavior.

First viewport:

- Product name: `RubyWhisper`.
- Literal offer/category: fast Mac dictation that works anywhere you can type.
- Primary action: download/sign up.
- Secondary action: view pricing.
- Visual: real or high-fidelity app surface showing island/main app, not abstract illustration.

Content sections:

- How it works.
- Recording island demo.
- Works anywhere you can type.
- Privacy: no server-side audio/transcript storage; Recent Wisprs live locally on the Mac.
- Pricing.
- Beta support.

Copy posture:

- Honest and specific.
- Do not claim "every text box."
- Use "works anywhere you can type."

### Pricing

Show one plan:

- `$7/month`.
- `$60/year`, shown as `$5/month billed annually`.
- Includes provider costs.
- Unlimited personal dictation with fair-use terms.
- 5,000-word free trial.

Do not show lifetime purchase.

### Login/Auth

- Browser-based magic-link sign-in.
- Email field.
- Clear pending state after link is sent.
- Desktop app receives completion state through app bridge.

### Checkout

- Use Stripe Checkout.
- Friend of Ruby code should be entered through Stripe promotion code flow if practical.
- Successful checkout returns to account/download.

### Account

Show:

- Email.
- Plan.
- Trial/usage word count.
- Billing/customer portal link.
- Download latest app.
- Support contact.

### Admin

Audience:

- Brandon/RubyWhisper operators only.

Show:

- Users.
- Plan/subscription status.
- Word usage.
- Request errors.
- Friend of Ruby status.
- Friend of Ruby code/batch creation.

Admin design:

- Utilitarian and dense.
- No decorative marketing layout.
- Clear filters/search.
- No private transcript/audio content anywhere.

### Onboarding

Steps:

1. Welcome/sign in.
2. Terms/Privacy acceptance.
3. Microphone permission.
4. Accessibility permission.
5. Test whisper.
6. Ready state with trial word balance.

Design requirements:

- Native macOS feel.
- Clear progress.
- System Settings guidance for permissions.
- No large marketing hero inside the app.
- Flow order, permission recovery, test whisper gating, keyboard accessibility,
  and local completion metadata must follow
  `docs/FIRST_RUN_ONBOARDING_PERMISSION_CONTRACT.md`.

### Recording Island

The island is the signature surface.

Requirements:

- Floating and draggable.
- Does not steal focus.
- Compact system-control feel.
- Visible only when useful.
- Live vocal visualizer during recording.
- Processing state immediately after stop.
- Success state brief and subtle.
- Error state clear and recoverable.
- Trial exhausted state includes upgrade action.
- Insertion failure state says: `Click a text box first.`

Do not show normal word count in the island. Only show low-limit/exhausted states when relevant.

### Main App / Settings

Sections:

- Account
- Plan
- Dictionary
- Hotkeys
- Appearance
- Advanced

Account:

- Signed-in email.
- Sign out.
- Support link.

Plan:

- Current plan.
- Trial words used/remaining.
- Monthly/lifetime usage if helpful.
- Upgrade/manage billing actions.

Dictionary:

- Add/edit/delete local terms.
- Empty state for first term.

Hotkeys:

- Show default hold `Fn`.
- Show toggle `Command+Fn`.
- Explain both are always available.
- If customization lands later, keep UI ready but do not require customization in v0.1.

Appearance:

- Light-first.
- Optional system/light/dark if inexpensive; light is the launch design direction.

Advanced:

- Cleanup enabled toggle.
- Context-aware cleanup toggle.
- Local history toggle/clear action.
- Diagnostics/support metadata export only if it contains no private text.

### Recent Wisprs

Requirements:

- Shows final cleaned text only.
- Includes successful and failed insertions.
- 7-day retention default.
- Prominent `Copy Whisper` or `Copy Transcript` button.
- Timestamp.
- Optional destination app if available without privacy risk.
- Clear all action.
- Empty state.

Do not show raw transcript in v0.1 unless implementation already produces it locally and privacy/product approves showing it.

## Component Inventory

Website:

- Header/nav.
- Hero.
- Primary/secondary buttons.
- Product demo media.
- Feature rows.
- Pricing panel.
- FAQ/support block.
- Auth card/page.
- Account plan card.
- Admin tables.
- Admin filters/search.
- Admin code creation form.

Mac app:

- Recording island.
- Vocal visualizer.
- Permission stepper.
- Status banners.
- Settings sidebar/tabs.
- Recent Wispr row.
- Copy button.
- Usage meter.
- Dictionary term row.
- Toggle controls.
- Billing/account buttons.

## Component States

Recording island:

- Hidden/idle.
- Recording.
- Nearing duration limit.
- Processing.
- Success.
- Error.
- Trial exhausted.
- Insertion failed.
- Permission denied.

Recent Wispr row:

- Normal.
- Failed insertion.
- Copied.
- Expiring soon if shown.

Buttons:

- Default.
- Hover.
- Active.
- Disabled.
- Loading.
- Focus.

Permission steps:

- Not started.
- Waiting for system permission.
- Granted.
- Denied.
- Needs retry.

Admin:

- Empty.
- Loading.
- Error.
- Unauthorized.
- Filtered/no results.

## Empty, Loading, Error, Success, Permission, Offline States

Empty:

- Recent Wisprs: "No recent wisprs yet."
- Dictionary: "Add names or terms RubyWhisper should preserve."
- Admin: "No users yet" or filtered state.

Loading:

- Website/account should use skeletons or simple spinners.
- Island should use processing animation, not a full spinner-only experience.

Error:

- Provider/backend error: clear, short, retry where safe.
- Insertion error: "Click a text box first."
- Auth error: reopen sign-in.
- Billing error: open account/billing.

Permission:

- Mic denied: guide to System Settings.
- Accessibility denied: guide to System Settings and explain it lets RubyWhisper paste text where the cursor is.

Offline:

- v0.1 requires internet.
- Show network-required error before or after recording depending on detection timing.

Success:

- Insertion success should be brief and unobtrusive.
- Checkout success should clearly return to download/account.

## Typography

Website:

- Apple-like neutral sans-serif.
- Use system font stack or a close production-safe option.
- Large but not oversized headline.
- Tight, readable body text.
- No negative letter spacing.

Mac app:

- Native system typography.
- Compact settings labels.
- Clear hierarchy.
- Avoid marketing-scale text inside utility surfaces.

## Color System

Direction:

- Light, clean, Apple-like.
- Avoid dark Superwhisper clone.
- Avoid one-note beige, purple, or blue-only palette.

Suggested roles:

- Background: near-white.
- Surface: white/subtle gray.
- Text primary: near-black.
- Text secondary: cool gray.
- Accent: refined red/ruby or restrained blue, used sparingly.
- Success: green.
- Warning: amber.
- Error: red.

Use color as state support, not the only signal.

## Spacing And Layout

Website:

- Full-width sections with constrained content.
- No nested cards.
- Keep first viewport product-led.
- Let next section peek below hero on common desktop/mobile heights.
- Use real app visuals/media instead of abstract SVG decoration.

Mac app:

- Native spacing.
- Compact rows.
- Settings should be scannable.
- Recording island should have stable dimensions so state changes do not jump.

## Icons And Imagery

Website:

- Product screenshots or generated high-fidelity app visuals.
- Avoid decorative blobs/orbs.
- Icons should clarify actions.

Mac app:

- Use familiar macOS iconography.
- Copy icon for copy actions.
- Gear/sliders for settings where appropriate.
- Avoid text-heavy toolbar buttons when recognizable icons work.

## Motion And Interaction

Use motion only where it improves confidence:

- Vocal visualizer.
- Recording start/stop.
- Processing transition.
- Brief success feedback.
- Permission step transitions.

Avoid:

- Slow ornamental animation.
- Distracting loops.
- Motion that delays repeated dictation.

Reduced motion:

- Visualizer can simplify.
- Transitions should shorten or disable.

## Accessibility

Website:

- Keyboard navigable.
- Visible focus states.
- WCAG AA contrast.
- Semantic headings.
- Form labels and errors.

Mac app:

- VoiceOver labels for settings and buttons.
- Keyboard-accessible settings.
- Island status exposed where feasible.
- Do not rely on color alone.
- Clear permission copy.

## Responsive And Platform Behavior

Website:

- Mobile, tablet, desktop.
- Pricing and checkout paths must work on mobile because login/checkout may happen in browser.

Mac app:

- macOS current plus recent.
- Menu bar app behavior.
- No menu bar icon state requirement beyond normal app presence.
- Island floats above apps without stealing focus.

## Design Tokens

Define once implementation starts:

```text
color.background
color.surface
color.text.primary
color.text.secondary
color.accent
color.success
color.warning
color.error

radius.small
radius.medium

space.1
space.2
space.3
space.4
space.6
space.8

duration.fast
duration.normal
easing.standard
```

Cards should generally use 8px radius or less unless native macOS components dictate otherwise.

## Developer Handoff Notes

- Island dimensions must be stable across states.
- Text must not overflow buttons or compact panels.
- Do not put admin pages in marketing-style cards.
- Do not hide upgrade/account actions behind unclear icons.
- Trial word count belongs in app/account surfaces, not the normal island.
- Recent Wisprs copy action must be easy to find.
- Privacy copy must match actual backend behavior.
- Website screenshots/demo media should show RubyWhisper itself.

## User-Test Scripts

### First-Run Test

1. Install app.
2. Sign in through browser.
3. Accept Terms/Privacy.
4. Grant mic and Accessibility permissions.
5. Complete test whisper.
6. Confirm word count appears in app.

Pass:

- User understands each step and reaches ready state without support.

### Daily Dictation Test

1. Focus Notes or browser text field.
2. Hold `Fn`.
3. Speak 10-20 seconds.
4. Release.
5. Confirm text inserts quickly and is lightly cleaned.

Pass:

- Flow feels fast and does not steal focus.

### Failure Recovery Test

1. Start recording with no text field focused.
2. Stop recording.
3. Confirm island says `Click a text box first.`
4. Open Recent Wisprs.
5. Copy whisper.

Pass:

- User does not lose text.

### Billing Test

1. Use trial words until exhausted in test mode.
2. Trigger upgrade.
3. Complete Stripe checkout.
4. Return to app and dictate again.

Pass:

- Plan state updates and dictation resumes.

### Privacy Trust Test

1. Review onboarding/website privacy statements.
2. Use Recent Wisprs.
3. Check account/admin surfaces.

Pass:

- User understands what is local and what is sent transiently.
- Admin cannot see transcript content.

## Design QA Checklist

- Website first viewport clearly says RubyWhisper and what it does.
- Website uses light Apple-like product direction.
- Pricing is clear: `$7/month` and `$60/year`.
- "Works anywhere you can type" appears instead of overbroad claims.
- Island does not steal focus.
- Island states are clear.
- Visualizer proves microphone pickup.
- Error states preserve user work.
- Recent Wisprs copy action is obvious.
- Trial word count visible in app/account.
- Onboarding explains mic and Accessibility permissions.
- Admin has no private content.
- Reduced motion respected.
- Text fits in all UI controls.
