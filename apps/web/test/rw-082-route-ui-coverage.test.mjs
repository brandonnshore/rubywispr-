import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const accountPagePath = path.join(appRoot, "account", "page.tsx");
const accountActionsPath = path.join(appRoot, "account", "actions.ts");

const privateSentinels = [
  "PRIVATE_TRANSCRIPT_SENTINEL",
  "SYNTHETIC_AUDIO_BYTES",
  "LOCAL_CONTEXT_FIXTURE",
  "clipboard_secret_value",
  "dictionary_secret_value",
  "s3://private-rubywhisper-audio/member.m4a",
  "/Users/member/RubyWhisper/private.m4a",
  "cus_rw_should_not_render",
  "price_rw_should_not_render",
];

test("RW-082 public routes keep pricing, download, and account navigation discoverable", async () => {
  const [homeModule, pricingModule, downloadModule] = await Promise.all([
    loadPageModule(publicPagePath, createPublicRequire()),
    loadPageModule(pricingPagePath, createPricingRequire()),
    loadPageModule(downloadPagePath, createDownloadRequire()),
  ]);

  const homeMarkup = renderToStaticMarkup(homeModule.default());
  const pricingMarkup = renderToStaticMarkup(pricingModule.default());
  const downloadMarkup = renderToStaticMarkup(downloadModule.default());

  assertRouteLinks(homeMarkup, ["/download", "/pricing", "/account"]);
  assert.match(homeMarkup, /Download beta/);
  assert.match(homeMarkup, /View pricing/);

  assertRouteLinks(pricingMarkup, ["/download", "/sign-up", "/account"]);
  assert.match(pricingMarkup, /\$7\/month billed monthly/);
  assert.match(pricingMarkup, /\$60\/year as \$5\/month billed annually/);
  assert.match(pricingMarkup, /Start monthly checkout/);
  assert.match(pricingMarkup, /Start annual checkout/);

  assertRouteLinks(downloadMarkup, ["/pricing", "/account"]);
  assert.match(downloadMarkup, /The beta app download is not available yet\./);
  assert.match(downloadMarkup, /Go to account/);
  assert.match(downloadMarkup, /View pricing/);
  assertNoUnsafeDownloadHref(downloadMarkup);
});

test("RW-082 checkout and billing portal entry points stay wired to server actions", async () => {
  const [pricingSource, accountSource, actionsSource] = await Promise.all([
    readFile(pricingPagePath, "utf8"),
    readFile(accountPagePath, "utf8"),
    readFile(accountActionsPath, "utf8"),
  ]);

  assert.match(pricingSource, /action:\s*startMonthlyCheckout/);
  assert.match(pricingSource, /action:\s*startAnnualCheckout/);
  assert.match(pricingSource, /form action=\{plan\.action\}/);
  assert.match(pricingSource, /Start monthly checkout/);
  assert.match(pricingSource, /Start annual checkout/);

  assert.match(accountSource, /<form action=\{startMonthlyCheckout\}>/);
  assert.match(accountSource, /<form action=\{startAnnualCheckout\}>/);
  assert.match(accountSource, /<form action=\{openBillingPortal\}>/);
  assert.match(accountSource, /Upgrade monthly/);
  assert.match(accountSource, /Upgrade annual/);
  assert.match(accountSource, /Manage billing/);

  assert.match(actionsSource, /createStripeCheckoutSession\(/);
  assert.match(actionsSource, /JSON\.stringify\(\{\s*plan\s*\}\)/);
  assert.match(actionsSource, /createStripePortalSession\(\)/);
  assert.match(actionsSource, /checkout_unavailable/);
  assert.match(actionsSource, /portal_unavailable/);
  assert.match(actionsSource, /customer_missing/);
  assert.match(actionsSource, /signed_out/);
  assert.doesNotMatch(actionsSource, /\bprice_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(actionsSource, /\bsk_(?:live|test)_/);
});

test("RW-082 account page keeps billing, download, support, and plan-state sections", async () => {
  const scenarios = [
    {
      billing: "customer_missing",
      expected: [
        /Trial Active/,
        /Plan status/,
        /Trial and usage metadata/,
        /Plan and billing/,
        /Mac beta app/,
        /Account support/,
        /Billing management is available after a subscription has been created/,
      ],
      metadata: accountMetadataWithPrivateSentinels({
        plan: "trial",
        planState: "trial_active",
        subscriptionStatus: undefined,
      }),
    },
    {
      billing: "portal_return",
      expected: [
        /Paid Active/,
        /Current plan<\/dt><dd>Annual/,
        /Subscription status<\/dt><dd>Active/,
        /Billing management was closed/,
        /Download RubyWhisper Mac beta/,
        /Email support/,
      ],
      latestAppDownloadUrl: "https://downloads.rubywhisper.test/RubyWhisper.dmg",
      metadata: accountMetadataWithPrivateSentinels({
        hasActiveSubscription: true,
        plan: "annual",
        planState: "paid_active",
        subscriptionStatus: "active",
      }),
    },
    {
      checkout: "cancelled",
      expected: [
        /Payment Failed/,
        /Checkout was cancelled\. No billing changes were made\./,
        /Manage billing/,
        /Open download page/,
        /Account support/,
      ],
      metadata: accountMetadataWithPrivateSentinels({
        paymentFailed: true,
        plan: "monthly",
        planState: "payment_failed",
        subscriptionStatus: "past_due",
      }),
    },
  ];

  for (const scenario of scenarios) {
    const pageModule = await loadPageModule(
      accountPagePath,
      createAccountRequire({
        accountMetadata: scenario.metadata,
        latestAppDownloadUrl: scenario.latestAppDownloadUrl,
      }),
    );
    const markup = renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve({
          billing: scenario.billing,
          checkout: scenario.checkout,
        }),
      }),
    );

    for (const expectedPattern of scenario.expected) {
      assert.match(markup, expectedPattern);
    }

    assert.match(markup, /Upgrade monthly/);
    assert.match(markup, /Upgrade annual/);
    assert.match(markup, /href="\/download"/);
    assert.match(markup, /href="mailto:/);
    assert.match(markup, /Email support/);
    assertNoPrivateSentinels(markup);
  }
});

test("RW-082 download page never emits non-portable artifact paths", async () => {
  const acceptedUrl = "https://downloads.rubywhisper.test/RubyWhisper-beta.zip";
  const cases = [
    {
      expected: /The beta app download is not available yet\./,
      latestAppDownloadUrl: undefined,
    },
    {
      expected: /Download RubyWhisper Mac beta/,
      latestAppDownloadUrl: acceptedUrl,
    },
  ];

  for (const scenario of cases) {
    const pageModule = await loadPageModule(
      downloadPagePath,
      createDownloadRequire({
        latestAppDownloadUrl: scenario.latestAppDownloadUrl,
      }),
    );
    const markup = renderToStaticMarkup(pageModule.default());

    assert.match(markup, scenario.expected);
    assertRouteLinks(markup, ["/pricing", "/account"]);
    assertNoUnsafeDownloadHref(markup);
  }
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
  return function requirePublicPageModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: linkComponent,
        };
      default:
        throw new Error(`Unexpected public page dependency ${specifier}`);
    }
  };
}

function createPricingRequire() {
  return function requirePricingPageModule(specifier) {
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
        throw new Error(`Unexpected pricing page dependency ${specifier}`);
    }
  };
}

function createDownloadRequire({ latestAppDownloadUrl = undefined } = {}) {
  return function requireDownloadPageModule(specifier) {
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
            latestAppDownloadUrl,
          },
        };
      default:
        throw new Error(`Unexpected download page dependency ${specifier}`);
    }
  };
}

function createAccountRequire({
  accountMetadata,
  latestAppDownloadUrl = undefined,
} = {}) {
  return function requireAccountPageModule(specifier) {
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
            latestAppDownloadUrl,
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
          readAccountPageMetadata: async () => accountMetadata,
        };
      case "./terms-acceptance":
        return {
          readAccountTermsAcceptanceState: async () => ({
            status: "accepted",
            termsAcceptedAt: "2026-05-04T12:00:00.000Z",
          }),
        };
      default:
        throw new Error(`Unexpected account page dependency ${specifier}`);
    }
  };
}

function linkComponent({ href, children, ...props }) {
  return requireCommonJs("react").createElement(
    "a",
    { ...props, href },
    children,
  );
}

function assertRouteLinks(markup, expectedHrefs) {
  for (const href of expectedHrefs) {
    assert.match(markup, new RegExp(`href="${escapeRegex(href)}"`));
  }
}

function assertNoUnsafeDownloadHref(markup) {
  assert.doesNotMatch(
    markup,
    /href="(?:file:|https?:\/\/(?:localhost|127\.0\.0\.1)|\/Users\/|s3:\/\/)/,
  );
}

function assertNoPrivateSentinels(markup) {
  for (const sentinel of privateSentinels) {
    assert.doesNotMatch(markup, new RegExp(escapeRegex(sentinel)));
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function accountMetadataWithPrivateSentinels({
  hasActiveSubscription = false,
  paymentFailed = false,
  plan,
  planState,
  subscriptionStatus,
}) {
  return {
    profile: {
      ok: true,
      value: {
        clerkUserId: "user_rw_synthetic_member_001",
        email: "member@example.com",
        isBlocked: false,
        privateTranscriptText: privateSentinels[0],
        termsAcceptedAt: "2026-05-04T05:00:00.000Z",
      },
    },
    snapshot: {
      ok: true,
      value: {
        accountStatus: "active",
        billingPortalAvailable: hasActiveSubscription,
        billingPortalUrl: null,
        canTranscribe: !paymentFailed,
        clipboardPreview: privateSentinels[3],
        email: "member@example.com",
        isTrialExhausted: false,
        isTrialLow: false,
        lifetimeWordsUsed: 1_250,
        localAudioPath: privateSentinels[6],
        monthlyPeriodStart: "2026-05-01",
        monthlyWordsUsed: 1_000,
        planState,
        preflightPolicy: "allow_if_started_under_limit",
        termsAccepted: true,
        trialWordsLimit: 5_000,
        trialWordsRemaining: 4_000,
        trialWordsUsed: 1_000,
      },
    },
    subscription: {
      ok: true,
      value: {
        clerkUserId: "user_rw_synthetic_member_001",
        currentPeriodEnd: "2026-06-04T00:00:00.000Z",
        hasActiveSubscription,
        isFriendOfRubyActive: false,
        paymentFailed,
        plan,
        planState,
        privateDictionaryTerm: privateSentinels[4],
        requiresSubscription: false,
        stripeCustomerId: privateSentinels[7],
        stripePriceId: privateSentinels[8],
        subscriptionStatus,
        transcriptStorageUrl: privateSentinels[5],
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
