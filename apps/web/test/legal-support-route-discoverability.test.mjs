import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const requireCommonJs = createRequire(import.meta.url);
const webRoot = path.join(repoRoot, "apps", "web");
const appRoot = path.join(webRoot, "src", "app");

const publicPagePath = path.join(appRoot, "(public)", "page.tsx");
const pricingPagePath = path.join(appRoot, "(public)", "pricing", "page.tsx");
const downloadPagePath = path.join(appRoot, "(public)", "download", "page.tsx");
const termsPagePath = path.join(appRoot, "(public)", "terms", "page.tsx");
const privacyPagePath = path.join(appRoot, "(public)", "privacy", "page.tsx");
const supportPagePath = path.join(appRoot, "(public)", "support", "page.tsx");
const accountPagePath = path.join(appRoot, "account", "page.tsx");
const authShellPath = path.join(
  appRoot,
  "(auth)",
  "_components",
  "auth-route-shell.tsx",
);
const webDesignSpecPath = path.join(repoRoot, "WEB_DESIGN_SPEC.md");
const productBriefPath = path.join(repoRoot, "PRODUCT_BRIEF.md");
const handoffPath = path.join(
  repoRoot,
  "docs",
  "qa",
  "rub-314-public-copy-handoff.md",
);

const legalSupportRoutes = ["/terms", "/privacy", "/support"];

const privateSentinels = [
  "PRIVATE_TRANSCRIPT_SENTINEL",
  "SYNTHETIC_AUDIO_BYTES",
  "LOCAL_CONTEXT_FIXTURE",
  "clipboard_secret_value",
  "dictionary_secret_value",
  "provider_request_payload",
];

test("legal and support route files stay present", async () => {
  await Promise.all([
    access(termsPagePath),
    access(privacyPagePath),
    access(supportPagePath),
  ]);
});

test("home, pricing, download, account, and auth surfaces expose legal and support routes", async () => {
  const [homeModule, pricingModule, downloadModule, accountModule, authModule] =
    await Promise.all([
      loadPageModule(publicPagePath, createPublicRequire()),
      loadPageModule(pricingPagePath, createPricingRequire()),
      loadPageModule(downloadPagePath, createDownloadRequire()),
      loadPageModule(accountPagePath, createAccountRequire()),
      loadPageModule(authShellPath, createAuthRequire()),
    ]);

  const homeMarkup = renderToStaticMarkup(homeModule.default());
  const pricingMarkup = renderToStaticMarkup(pricingModule.default());
  const downloadMarkup = renderToStaticMarkup(downloadModule.default());
  const accountMarkup = renderToStaticMarkup(
    await accountModule.default({
      searchParams: Promise.resolve({}),
    }),
  );
  const signInMarkup = renderToStaticMarkup(
    authModule.AuthRouteShell({ mode: "sign-in" }),
  );
  const signUpMarkup = renderToStaticMarkup(
    authModule.AuthRouteShell({ mode: "sign-up" }),
  );

  assertRouteLinks(homeMarkup, legalSupportRoutes);
  assertRouteLinks(pricingMarkup, legalSupportRoutes);
  assertRouteLinks(downloadMarkup, legalSupportRoutes);
  assertRouteLinks(accountMarkup, legalSupportRoutes);
  assertRouteLinks(signInMarkup, legalSupportRoutes);
  assertRouteLinks(signUpMarkup, legalSupportRoutes);

  assert.match(accountMarkup, /before trial\s+transcription/);
  assert.match(signInMarkup, /before trial dictation/);
  assert.match(signUpMarkup, /before trial dictation/);
  assert.match(accountMarkup, /href="mailto:/);
  assert.match(accountMarkup, /Email support/);
});

test("legal and support copy stays privacy-safe and metadata-only", async () => {
  const [termsModule, privacyModule, supportModule] = await Promise.all([
    loadPageModule(termsPagePath, createPublicRequire()),
    loadPageModule(privacyPagePath, createPublicRequire()),
    loadPageModule(supportPagePath, createPublicRequire()),
  ]);

  const combinedMarkup = [
    renderToStaticMarkup(termsModule.default()),
    renderToStaticMarkup(privacyModule.default()),
    renderToStaticMarkup(supportModule.default()),
  ].join("\n");
  const text = textContent(combinedMarkup);

  assert.match(text, /metadata-only/);
  assert.match(text, /do not store audio, raw transcripts, cleaned text/i);
  assert.match(text, /Support and admin operations should never see transcript/i);
  assert.match(text, /Do not include private dictation by default/);
  assertNoPrivateSentinels(text);
  assertNoUnsafeStorageClaims(text);
  assertNoPrivateContentRequests(text);
});

test("public and spec copy keep insertion claims source-safe", async () => {
  const [homeModule, pricingModule, termsModule, webDesignSpec, productBrief] =
    await Promise.all([
      loadPageModule(publicPagePath, createPublicRequire()),
      loadPageModule(pricingPagePath, createPricingRequire()),
      loadPageModule(termsPagePath, createPublicRequire()),
      readFile(webDesignSpecPath, "utf8"),
      readFile(productBriefPath, "utf8"),
    ]);

  const publicText = textContent(
    [
      renderToStaticMarkup(homeModule.default()),
      renderToStaticMarkup(pricingModule.default()),
      renderToStaticMarkup(termsModule.default()),
    ].join("\n"),
  );
  const specText = textContent([webDesignSpec, productBrief].join("\n"));

  assert.match(publicText, /works anywhere you can type/i);
  assert.match(specText, /works anywhere you can type/i);
  assertNoOverbroadInsertionClaims(publicText);
  assertNoOverbroadInsertionClaims(specText);
});

test("RUB-314 handoff lists only human-owned launch decisions", async () => {
  const handoff = await readFile(handoffPath, "utf8");

  assert.match(handoff, /canonical domain/i);
  assert.match(handoff, /policy owner\/reviewer/i);
  assert.match(handoff, /final Terms\/Privacy approval/i);
  assert.match(handoff, /public launch approval/i);
  assert.match(handoff, /RW-017 remains human-gated/i);
  assert.doesNotMatch(
    handoff,
    /\.env\.local|rubywhisper\.env|sk_(?:live|test)_|whsec_|Bearer\s+[A-Za-z0-9._-]+|\/Users\//i,
  );
});

async function loadPageModule(filePath, requireFunction) {
  const source = await readFile(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: requireFunction,
  };

  vm.runInNewContext(outputText, sandbox, { filename: filePath });

  return commonJsModule.exports;
}

function createPublicRequire() {
  return function requirePublicModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: linkComponent,
        };
      case "next/image":
        return {
          default: imageComponent,
        };
      default:
        throw new Error(`Unexpected public dependency ${specifier}`);
    }
  };
}

function createPricingRequire() {
  return function requirePricingModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: linkComponent,
        };
      case "../../account/actions":
        return {
          startAnnualCheckout: async () => {},
          startMonthlyCheckout: async () => {},
        };
      default:
        throw new Error(`Unexpected pricing dependency ${specifier}`);
    }
  };
}

function createDownloadRequire() {
  return function requireDownloadModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: linkComponent,
        };
      case "@/config/client":
        return {
          clientEnv: {
            latestAppDownloadUrl: undefined,
          },
        };
      default:
        throw new Error(`Unexpected download dependency ${specifier}`);
    }
  };
}

function createAuthRequire() {
  return function requireAuthModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "@clerk/react":
        return {
          ClerkProvider: ({ children }) => children,
          SignIn: () => null,
          SignUp: () => null,
        };
      case "next/link":
        return {
          default: ({ href, children, ...props }) =>
            requireCommonJs("react").createElement(
              "a",
              { ...props, href },
              children,
            ),
        };
      case "next/image":
        return {
          default: imageComponent,
        };
      case "@/config/client":
        return {
          clientEnv: {
            clerkPublishableKey: "",
          },
        };
      default:
        throw new Error(`Unexpected auth dependency ${specifier}`);
    }
  };
}

function createAccountRequire() {
  return function requireAccountModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: linkComponent,
        };
      case "@/config/client":
        return {
          clientEnv: {
            latestAppDownloadUrl: undefined,
          },
        };
      case "@/lib/auth/clerk":
        return {
          requireClerkUserIdForPage: async () => "user_rw_synthetic_member_001",
        };
      case "./actions":
        return {
          acceptAccountTermsPrivacy: async () => {},
          openBillingPortal: async () => {},
          startAnnualCheckout: async () => {},
          startMonthlyCheckout: async () => {},
        };
      case "./metadata":
        return {
          readAccountPageMetadata: async () => accountMetadataWithPrivateSentinels(),
        };
      case "./terms-acceptance":
        return {
          readAccountTermsAcceptanceState: async () => ({
            status: "not_accepted",
          }),
        };
      default:
        throw new Error(`Unexpected account dependency ${specifier}`);
    }
  };
}

function accountMetadataWithPrivateSentinels() {
  return {
    profile: {
      ok: true,
      value: {
        clerkUserId: "user_rw_synthetic_member_001",
        email: "member@example.com",
        isBlocked: false,
        privateTranscriptText: privateSentinels[0],
        termsAcceptedAt: undefined,
      },
    },
    snapshot: {
      ok: true,
      value: {
        accountStatus: "active",
        billingPortalAvailable: false,
        canTranscribe: true,
        clipboardPreview: privateSentinels[3],
        email: "member@example.com",
        isTrialExhausted: false,
        isTrialLow: false,
        lifetimeWordsUsed: 1_250,
        localAudioPath: "/Users/member/RubyWhisper/private.m4a",
        monthlyPeriodStart: "2026-05-01",
        monthlyWordsUsed: 1_000,
        planState: "trial_active",
        preflightPolicy: "allow_if_started_under_limit",
        termsAccepted: false,
        trialWordsLimit: 5_000,
        trialWordsRemaining: 4_000,
        trialWordsUsed: 1_000,
      },
    },
    subscription: {
      ok: true,
      value: {
        clerkUserId: "user_rw_synthetic_member_001",
        currentPeriodEnd: undefined,
        hasActiveSubscription: false,
        isFriendOfRubyActive: false,
        paymentFailed: false,
        plan: "trial",
        planState: "trial_active",
        privateDictionaryTerm: privateSentinels[4],
        requiresSubscription: false,
        stripeCustomerId: "cus_rw_should_not_render",
        stripePriceId: "price_rw_should_not_render",
        subscriptionStatus: undefined,
        transcriptStorageUrl: "s3://private-rubywhisper-audio/member.m4a",
        updatedAt: "2026-05-04T12:00:00.000Z",
      },
    },
    usageCounters: {
      ok: true,
      value: {
        audioBytesLabel: privateSentinels[1],
        contextPreview: privateSentinels[2],
        clerkUserId: "user_rw_synthetic_member_001",
        isTrialExhausted: false,
        isTrialLow: false,
        lifetimeWordsUsed: 1_250,
        monthlyPeriodStart: "2026-05-01",
        monthlyWordsUsed: 1_000,
        trialWordsLimit: 5_000,
        trialWordsRemaining: 4_000,
        trialWordsUsed: 1_000,
        updatedAt: "2026-05-04T12:00:00.000Z",
      },
    },
  };
}

function linkComponent({ href, children, ...props }) {
  return requireCommonJs("react").createElement(
    "a",
    { ...props, href },
    children,
  );
}

function imageComponent(props) {
  return requireCommonJs("react").createElement("img", props);
}

function assertRouteLinks(markup, expectedHrefs) {
  for (const href of expectedHrefs) {
    assert.match(markup, new RegExp(`href="${escapeRegex(href)}"`));
  }
}

function assertNoPrivateSentinels(text) {
  for (const sentinel of privateSentinels) {
    assert.doesNotMatch(text, new RegExp(escapeRegex(sentinel)));
  }
}

function assertNoUnsafeStorageClaims(text) {
  const unsafeClaimPatterns = [
    /\bserver-side transcript storage\b/i,
    /\b(?:audio|transcript|transcripts|audio and transcript) content (?:is|are) stored on RubyWhisper servers\b/i,
    /\bRubyWhisper stores? (?:your )?(?:audio|transcript|transcripts|audio and transcript) (?:content )?(?:on|in) (?:its|RubyWhisper) servers\b/i,
    /\bwe store (?:your )?(?:audio|transcript|transcripts|audio and transcript) (?:content )?(?:server-side|on our servers)\b/i,
    /\bRubyWhisper servers keep (?:your )?(?:audio|transcript|transcripts|audio and transcript) content\b/i,
    /\bsupport (?:can|may|will) (?:access|review|see|read) (?:private )?(?:dictation|audio|transcript|transcripts|cleaned text) content\b/i,
    /\badmin (?:can|may|will) (?:access|review|see|read) (?:private )?(?:dictation|audio|transcript|transcripts|cleaned text) content\b/i,
  ];

  for (const unsafeClaimPattern of unsafeClaimPatterns) {
    assert.doesNotMatch(text, unsafeClaimPattern);
  }
}

function assertNoPrivateContentRequests(text) {
  const unsafeRequestPatterns = [
    /\bplease (?:send|include|attach|provide) (?:private )?(?:dictation|audio|transcript|transcripts|cleaned text|clipboard content|prompts?|provider payloads?)\b/i,
    /\bsend (?:us|support) (?:private )?(?:dictation|audio|transcript|transcripts|cleaned text|clipboard content|prompts?|provider payloads?)\b/i,
    /\binclude (?:your )?(?:private )?(?:dictation text|audio files?|transcripts?|cleaned text|clipboard contents?|prompts?|provider payloads?) by default\b/i,
    /\bunless you intentionally choose to share (?:it|them)\b/i,
  ];

  for (const unsafeRequestPattern of unsafeRequestPatterns) {
    assert.doesNotMatch(text, unsafeRequestPattern);
  }
}

function assertNoOverbroadInsertionClaims(text) {
  const allowedProhibition = /Do not claim "every text box\."/i;
  const textWithoutAllowedProhibition = text.replace(allowedProhibition, " ");
  const unsafeInsertionClaimPatterns = [
    /\bevery text box\b/i,
    /\bany text field in any Mac app\b/i,
    /\bevery app\b/i,
    /\balways (?:insert|inserts|land|lands)\b/i,
    /\bguaranteed (?:insertion|to insert|behavior)\b/i,
  ];

  for (const unsafeInsertionClaimPattern of unsafeInsertionClaimPatterns) {
    assert.doesNotMatch(
      textWithoutAllowedProhibition,
      unsafeInsertionClaimPattern,
    );
  }
}

function textContent(markup) {
  return markup
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
