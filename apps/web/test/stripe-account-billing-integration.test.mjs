import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

import { assertNoLiveBackendIntegrationInput } from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const requireCommonJs = createRequire(import.meta.url);
const webRoot = path.join(repoRoot, "apps", "web");
const accountActionsPath = path.join(
  webRoot,
  "src",
  "app",
  "account",
  "actions.ts",
);
const accountPagePath = path.join(webRoot, "src", "app", "account", "page.tsx");
const checkoutRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "stripe",
  "checkout",
  "route.ts",
);
const portalRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "stripe",
  "portal",
  "route.ts",
);
const webReadmePath = path.join(webRoot, "README.md");
const syntheticUserId = "user_rw_synthetic_member_001";
const syntheticCustomerId = "cus_rw_synthetic_member_001";
const validStripeConfig = {
  apiVersion: "2026-04-22.dahlia",
  priceIds: {
    annual: "price_annual_synthetic",
    monthly: "price_monthly_synthetic",
  },
};

test("account billing actions compose with checkout route wiring for monthly and annual plans", async () => {
  const integration = await loadStripeAccountBillingIntegration();

  await assertRejectsRedirect(
    integration.moduleExports.startMonthlyCheckout(),
    "https://checkout.rubywhisper.test/session/monthly",
  );
  await assertRejectsRedirect(
    integration.moduleExports.startAnnualCheckout(),
    "https://checkout.rubywhisper.test/session/annual",
  );

  assert.deepEqual(
    integration.calls.checkoutSessions.map((call) => ({
      client: call.client.kind,
      lineItems: toPlainObject(call.input.line_items),
      metadata: toPlainObject(call.input.metadata),
      mode: call.input.mode,
      subscriptionMetadata: toPlainObject(call.input.subscription_data.metadata),
    })),
    [
      {
        client: "mock-stripe-client",
        lineItems: [{ price: "price_monthly_synthetic", quantity: 1 }],
        metadata: {
          clerkUserId: syntheticUserId,
          rubyWhisperPlan: "monthly",
        },
        mode: "subscription",
        subscriptionMetadata: {
          clerkUserId: syntheticUserId,
          rubyWhisperPlan: "monthly",
        },
      },
      {
        client: "mock-stripe-client",
        lineItems: [{ price: "price_annual_synthetic", quantity: 1 }],
        metadata: {
          clerkUserId: syntheticUserId,
          rubyWhisperPlan: "annual",
        },
        mode: "subscription",
        subscriptionMetadata: {
          clerkUserId: syntheticUserId,
          rubyWhisperPlan: "annual",
        },
      },
    ],
  );
  assert.deepEqual(
    integration.responses.map((response) => ({
      cacheControl: response.cacheControl,
      route: response.route,
      status: response.status,
    })),
    [
      { cacheControl: "no-store", route: "checkout", status: 200 },
      { cacheControl: "no-store", route: "checkout", status: 200 },
    ],
  );
  assertPublicBillingOutputsAreSanitized(integration.responses);
});

test("account billing action composes with portal route wiring for cached customers", async () => {
  const integration = await loadStripeAccountBillingIntegration();

  await assertRejectsRedirect(
    integration.moduleExports.openBillingPortal(),
    "https://billing.rubywhisper.test/session/portal",
  );

  assert.deepEqual(
    integration.calls.portalSessions.map((call) => ({
      client: call.client.kind,
      input: toPlainObject(call.input),
    })),
    [
      {
        client: "mock-stripe-client",
        input: {
          customer: syntheticCustomerId,
          return_url:
            "https://app.rubywhisper.test/account?billing=portal_return",
        },
      },
    ],
  );
  assert.deepEqual(
    integration.responses.map((response) => ({
      cacheControl: response.cacheControl,
      route: response.route,
      status: response.status,
    })),
    [{ cacheControl: "no-store", route: "portal", status: 200 }],
  );
  assertPublicBillingOutputsAreSanitized(integration.responses);
});

test("account-to-Stripe integration failure paths stay sanitized and no-store", async () => {
  const scenarios = [
    {
      expectedRedirect: "/account?billing=signed_out",
      expectedStatus: 401,
      name: "monthly checkout without auth",
      options: { signedOut: true },
      route: "checkout",
      run: (actions) => actions.startMonthlyCheckout(),
    },
    {
      expectedRedirect: "/account?billing=customer_missing",
      expectedStatus: 409,
      name: "portal without cached customer metadata",
      options: { customerMetadata: { action: "missing" } },
      route: "portal",
      run: (actions) => actions.openBillingPortal(),
    },
    {
      expectedRedirect: "/account?billing=checkout_unavailable",
      expectedStatus: 503,
      name: "checkout with missing Stripe config",
      options: { missingStripeConfig: true },
      route: "checkout",
      run: (actions) => actions.startAnnualCheckout(),
    },
    {
      expectedRedirect: "/account?billing=portal_unavailable",
      expectedStatus: 503,
      name: "portal with missing Stripe config",
      options: { missingStripeConfig: true },
      route: "portal",
      run: (actions) => actions.openBillingPortal(),
    },
    {
      expectedRedirect: "/account?billing=checkout_unavailable",
      expectedStatus: 503,
      name: "checkout with mocked Stripe failure",
      options: { checkoutFailure: true },
      route: "checkout",
      run: (actions) => actions.startMonthlyCheckout(),
    },
    {
      expectedRedirect: "/account?billing=portal_unavailable",
      expectedStatus: 503,
      name: "portal with mocked Stripe failure",
      options: { portalFailure: true },
      route: "portal",
      run: (actions) => actions.openBillingPortal(),
    },
  ];

  for (const scenario of scenarios) {
    const integration = await loadStripeAccountBillingIntegration(
      scenario.options,
    );

    await assertRejectsRedirect(
      scenario.run(integration.moduleExports),
      scenario.expectedRedirect,
    );

    assert.deepEqual(
      integration.responses.map((response) => ({
        cacheControl: response.cacheControl,
        route: response.route,
        status: response.status,
      })),
      [
        {
          cacheControl: "no-store",
          route: scenario.route,
          status: scenario.expectedStatus,
        },
      ],
      scenario.name,
    );
    assertPublicBillingOutputsAreSanitized([
      scenario.expectedRedirect,
      integration.responses,
    ]);
  }
});

test("account billing rendered states stay metadata-only", async () => {
  const pageModule = await loadAccountPageModule();
  const scenarios = [
    {
      params: { checkout: "success" },
      text: "Checkout was completed. Your account may take a moment to update.",
    },
    {
      params: { checkout: "cancelled" },
      text: "Checkout was cancelled. No billing changes were made.",
    },
    {
      params: { billing: "customer_missing" },
      text:
        "Billing management is available after a subscription has been created for this account.",
    },
    {
      params: { billing: "portal_unavailable" },
      text: "Billing management is temporarily unavailable. Try again later.",
    },
    {
      params: { billing: "signed_out" },
      text: "Sign in before managing billing.",
    },
  ];

  for (const scenario of scenarios) {
    const markup = renderToStaticMarkup(
      await pageModule.default({
        searchParams: Promise.resolve(scenario.params),
      }),
    );

    assert.match(markup, new RegExp(escapeRegExp(scenario.text)));
    assert.match(markup, /role="status"/);
    assert.match(markup, /aria-live="polite"/);
    assertPublicBillingOutputsAreSanitized(markup);
  }
});

test("manual Stripe test-mode smoke remains human-gated outside synthetic coverage", async () => {
  const readme = await readFile(webReadmePath, "utf8");

  assert.match(readme, /manual Stripe test-mode smoke/i);
  assert.match(readme, /RUB-161/);
  assert.match(readme, /Brandon/);
  assert.match(readme, /test-mode setup/i);
});

async function loadStripeAccountBillingIntegration(options = {}) {
  const calls = {
    checkoutSessions: [],
    portalSessions: [],
  };
  const responses = [];
  const checkoutRouteModule = await loadCheckoutRouteModule();
  const portalRouteModule = await loadPortalRouteModule();
  const checkoutHandler = checkoutRouteModule.createStripeCheckoutRouteHandler({
    appUrl: "https://app.rubywhisper.test",
    createCheckoutSession: async (input, client) => {
      calls.checkoutSessions.push({ client, input });

      if (options.checkoutFailure) {
        throw new Error("Synthetic Stripe checkout failed with sk_test_short");
      }

      return {
        url: `https://checkout.rubywhisper.test/session/${input.metadata.rubyWhisperPlan}`,
      };
    },
    createStripeContext: () =>
      createStripeContextResult(options.missingStripeConfig),
    requireAuth: () => createAuthResult(options.signedOut),
    resolveBillingConfig: () =>
      createBillingConfigResult(options.missingStripeConfig),
  });
  const portalHandler = portalRouteModule.createStripePortalRouteHandler({
    appUrl: "https://app.rubywhisper.test",
    createPortalSession: async (input, client) => {
      calls.portalSessions.push({ client, input });

      if (options.portalFailure) {
        throw new Error(
          "Synthetic Stripe portal failed with sk_test_short and cus_rw_synthetic_member_001",
        );
      }

      return {
        url: "https://billing.rubywhisper.test/session/portal",
      };
    },
    createStripeContext: () =>
      createStripeContextResult(options.missingStripeConfig),
    readCustomerMetadata: async () =>
      createCustomerMetadataResult(options.customerMetadata),
    requireAuth: () => createAuthResult(options.signedOut),
    resolveBillingConfig: () =>
      createBillingConfigResult(options.missingStripeConfig),
  });
  const moduleExports = await loadAccountActionsModule({
    checkoutHandler: wrapRouteHandler("checkout", checkoutHandler, responses),
    portalHandler: wrapRouteHandler("portal", portalHandler, responses),
  });

  return {
    calls,
    moduleExports,
    responses,
  };
}

async function loadAccountActionsModule({ checkoutHandler, portalHandler }) {
  const source = await readFile(accountActionsPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: accountActionsPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      FormData,
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createAccountActionsRequire({ checkoutHandler, portalHandler }),
    },
    { filename: accountActionsPath },
  );

  return commonJsModule.exports;
}

async function loadAccountPageModule() {
  const source = await readFile(accountPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: accountPagePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createAccountPageRequire(),
    },
    { filename: accountPagePath },
  );

  return commonJsModule.exports;
}

async function loadCheckoutRouteModule() {
  return loadCompiledModule(checkoutRoutePath, createCheckoutRouteRequire());
}

async function loadPortalRouteModule() {
  return loadCompiledModule(portalRoutePath, createPortalRouteRequire());
}

async function loadCompiledModule(filePath, requireModule) {
  const source = await readFile(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: requireModule,
    },
    { filename: filePath },
  );

  return commonJsModule.exports;
}

function createAccountActionsRequire({ checkoutHandler, portalHandler }) {
  return function requireAccountActionsModule(specifier) {
    switch (specifier) {
      case "next/cache":
        return {
          revalidatePath: () => {},
        };
      case "next/navigation":
        return {
          redirect: (url) => {
            throw Object.assign(new Error("NEXT_REDIRECT"), { url });
          },
        };
      case "../api/stripe/checkout/route":
        return { POST: checkoutHandler };
      case "../api/stripe/portal/route":
        return { POST: portalHandler };
      case "./terms-acceptance":
        return {
          recordSignedInAccountTermsAcceptance: async () => ({
            status: "accepted",
          }),
        };
      default:
        throw new Error(`Unexpected account actions dependency ${specifier}`);
    }
  };
}

function createAccountPageRequire() {
  return function requireAccountPageModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "@/lib/auth/clerk":
        return {
          requireClerkUserIdForPage: async () => syntheticUserId,
        };
      case "./actions":
        return {
          acceptAccountTermsPrivacy: async () => {},
          openBillingPortal: async () => {},
          startAnnualCheckout: async () => {},
          startMonthlyCheckout: async () => {},
        };
      case "./terms-acceptance":
        return {
          readAccountTermsAcceptanceState: async () => ({
            status: "missing",
          }),
        };
      default:
        throw new Error(`Unexpected account page dependency ${specifier}`);
    }
  };
}

function createCheckoutRouteRequire() {
  return function requireCheckoutRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@/config/client":
        return { clientEnv: { appUrl: "https://app.rubywhisper.test" } };
      case "@/lib/api/errors":
        return { rubyWhisperApiErrorResponse: createApiErrorResponse };
      case "@/lib/auth/clerk":
        return {
          requireClerkUserId: async () => createAuthResult(false),
        };
      case "@/lib/billing/stripe":
        return {
          createStripeBillingContext: () => createStripeContextResult(false),
          normalizeStripeBillingConfig: () => createBillingConfigResult(false),
          resolveStripeBillingPlan,
        };
      default:
        throw new Error(`Unexpected checkout route dependency ${specifier}`);
    }
  };
}

function createPortalRouteRequire() {
  return function requirePortalRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient: () => {
            throw new Error("Synthetic integration must inject Supabase reads.");
          },
        };
      case "@/config/client":
        return { clientEnv: { appUrl: "https://app.rubywhisper.test" } };
      case "@/lib/account/subscription-customer-metadata":
        return {
          readRubyWhisperSubscriptionCustomerMetadata: async () =>
            createCustomerMetadataResult(),
        };
      case "@/lib/api/errors":
        return { rubyWhisperApiErrorResponse: createApiErrorResponse };
      case "@/lib/auth/clerk":
        return {
          requireClerkUserId: async () => createAuthResult(false),
        };
      case "@/lib/billing/stripe":
        return {
          createStripeBillingContext: () => createStripeContextResult(false),
          normalizeStripeBillingConfig: () => createBillingConfigResult(false),
        };
      case "@/lib/supabase/server":
        return {};
      default:
        throw new Error(`Unexpected portal route dependency ${specifier}`);
    }
  };
}

function wrapRouteHandler(route, handler, responses) {
  return async (...args) => {
    const response = await handler(...args);
    const body = await response.clone().json().catch(() => null);

    responses.push({
      body,
      cacheControl: response.headers.get("Cache-Control"),
      route,
      status: response.status,
    });

    return response;
  };
}

function createAuthResult(signedOut) {
  if (signedOut) {
    return {
      error: {
        code: "clerk_session_required",
        message: "A Clerk user session is required.",
      },
      ok: false,
    };
  }

  return {
    ok: true,
    userId: syntheticUserId,
  };
}

function createBillingConfigResult(missingStripeConfig) {
  if (missingStripeConfig) {
    return {
      error: {
        code: "stripe_billing_config_missing",
        invalidFields: [],
        message: "Stripe billing is not configured for this request.",
        missingFields: ["secretKey"],
      },
      ok: false,
    };
  }

  return {
    config: validStripeConfig,
    ok: true,
  };
}

function createStripeContextResult(missingStripeConfig) {
  if (missingStripeConfig) {
    return createBillingConfigResult(true);
  }

  return {
    context: {
      apiVersion: validStripeConfig.apiVersion,
      client: mockStripeClient(),
      priceIds: validStripeConfig.priceIds,
    },
    ok: true,
  };
}

function createCustomerMetadataResult(overrides = {}) {
  if (overrides.action === "missing") {
    return {
      action: "missing",
      customerMetadata: {
        clerkUserId: syntheticUserId,
      },
      ok: true,
    };
  }

  return {
    action: "found",
    customerMetadata: {
      clerkUserId: syntheticUserId,
      stripeCustomerId: syntheticCustomerId,
    },
    ok: true,
  };
}

function resolveStripeBillingPlan(plan, config) {
  if (plan !== "monthly" && plan !== "annual") {
    return {
      error: {
        code: "stripe_billing_plan_unknown",
        invalidFields: [],
        message: "Stripe billing is not configured for this request.",
        missingFields: [],
      },
      ok: false,
    };
  }

  return {
    ok: true,
    plan,
    priceId: config.priceIds[plan],
  };
}

function createApiErrorResponse(code) {
  const descriptors = {
    service_unavailable: {
      desktopState: "error",
      httpStatus: 503,
      message: "RubyWhisper is temporarily unavailable.",
      recovery: "retry",
      retryable: true,
    },
    signed_out: {
      desktopState: "signed_out",
      httpStatus: 401,
      message: "Sign in to use RubyWhisper.",
      recovery: "open_sign_in",
      retryable: false,
    },
  };
  const descriptor = descriptors[code];

  return Response.json(
    {
      ok: false,
      error: {
        code,
        desktopState: descriptor.desktopState,
        message: descriptor.message,
        recovery: descriptor.recovery,
        retryable: descriptor.retryable,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: descriptor.httpStatus,
    },
  );
}

function mockStripeClient() {
  return {
    billingPortal: {
      sessions: {
        create: async () => {
          throw new Error("Synthetic portal session mock was not injected.");
        },
      },
    },
    checkout: {
      sessions: {
        create: async () => {
          throw new Error("Synthetic checkout session mock was not injected.");
        },
      },
    },
    kind: "mock-stripe-client",
  };
}

async function assertRejectsRedirect(promise, expectedUrl) {
  await assert.rejects(
    promise,
    (error) => error?.message === "NEXT_REDIRECT" && error.url === expectedUrl,
  );
}

function assertPublicBillingOutputsAreSanitized(value) {
  assertNoLiveBackendIntegrationInput(value, "Stripe account billing output");
  assert.doesNotMatch(JSON.stringify(value), /STRIPE_[A-Z0-9_]+/);
  assert.doesNotMatch(JSON.stringify(value), /sk_(?:live|test)_/);
  assert.doesNotMatch(JSON.stringify(value), /\bprice_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(JSON.stringify(value), /\bcus_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(JSON.stringify(value), /\buser_rw_synthetic\b/);
  assert.doesNotMatch(
    JSON.stringify(value),
    /\bpayment_method\b|\bcard\b|\binvoice\b|\bsecretKey\b/,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
