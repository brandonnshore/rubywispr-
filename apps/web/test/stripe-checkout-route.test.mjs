import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

import { createSyntheticBackendRequest } from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const checkoutRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "stripe",
  "checkout",
  "route.ts",
);
const validStripeConfig = {
  apiVersion: "2026-04-22.dahlia",
  priceIds: {
    annual: "price_annual_synthetic",
    monthly: "price_monthly_synthetic",
  },
};

test("Stripe checkout route creates monthly subscription sessions server-side", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { calls, handler } = createCheckoutHandler(routeModule);
  const response = await handler(
    checkoutRequest({
      plan: "monthly",
      price: "price_attacker_supplied",
      priceId: "price_attacker_supplied",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    url: "https://checkout.rubywhisper.test/session/monthly",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].client.kind, "mock-stripe-client");
  assert.equal(calls[0].input.mode, "subscription");
  assert.deepEqual(toPlainObject(calls[0].input.line_items), [
    {
      price: "price_monthly_synthetic",
      quantity: 1,
    },
  ]);
  assert.equal(calls[0].input.client_reference_id, "user_rw_synthetic_member_001");
  assert.deepEqual(toPlainObject(calls[0].input.metadata), {
    clerkUserId: "user_rw_synthetic_member_001",
    rubyWhisperPlan: "monthly",
  });
  assert.deepEqual(toPlainObject(calls[0].input.subscription_data.metadata), {
    clerkUserId: "user_rw_synthetic_member_001",
    rubyWhisperPlan: "monthly",
  });
  assert.equal(
    calls[0].input.success_url,
    "https://app.rubywhisper.test/account?checkout=success",
  );
  assert.equal(
    calls[0].input.cancel_url,
    "https://app.rubywhisper.test/account?checkout=cancelled",
  );
  assert.doesNotMatch(JSON.stringify(calls), /price_attacker_supplied/);
});

test("Stripe checkout route creates annual subscription sessions", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { calls, handler } = createCheckoutHandler(routeModule, {
    checkoutUrl: "https://checkout.rubywhisper.test/session/annual",
  });
  const response = await handler(checkoutRequest({ plan: "annual" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    ok: true,
    url: "https://checkout.rubywhisper.test/session/annual",
  });
  assert.equal(calls[0].input.mode, "subscription");
  assert.deepEqual(toPlainObject(calls[0].input.line_items), [
    {
      price: "price_annual_synthetic",
      quantity: 1,
    },
  ]);
  assert.equal(calls[0].input.metadata.rubyWhisperPlan, "annual");
});

test("Stripe checkout route rejects invalid plans before Stripe calls", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { calls, handler } = createCheckoutHandler(routeModule, {
    createCheckoutSession: async () => {
      throw new Error("Stripe must not be called for invalid plans.");
    },
  });
  const response = await handler(
    checkoutRequest({
      plan: "lifetime",
      priceId: "price_attacker_supplied",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "stripe_checkout_plan_invalid",
      message: "Choose a valid RubyWhisper billing plan.",
    },
  });
  assert.deepEqual(calls, []);
});

test("Stripe checkout route requires authenticated Clerk users", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { handler } = createCheckoutHandler(routeModule, {
    requireAuth: async () => ({
      error: {
        code: "clerk_session_required",
        message: "A Clerk user session is required.",
      },
      ok: false,
    }),
    resolveBillingConfig: () => {
      throw new Error("Billing config must not be read for signed-out users.");
    },
  });
  const response = await handler(checkoutRequest({ plan: "monthly" }));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "signed_out",
      desktopState: "signed_out",
      message: "Sign in to use RubyWhisper.",
      recovery: "open_sign_in",
      retryable: false,
    },
  });
});

test("Stripe checkout route returns sanitized errors for missing Stripe config", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { handler } = createCheckoutHandler(routeModule, {
    createStripeContext: () => {
      throw new Error("Stripe client must not be created with missing config.");
    },
    resolveBillingConfig: () => ({
      error: {
        code: "stripe_billing_config_missing",
        invalidFields: [],
        message: "Stripe billing is not configured for this request.",
        missingFields: ["secretKey"],
      },
      ok: false,
    }),
  });
  const response = await handler(checkoutRequest({ plan: "monthly" }));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.doesNotMatch(
    JSON.stringify(body),
    /secretKey|STRIPE_|sk_test|price_monthly_synthetic/,
  );
});

test("Stripe checkout route requires a configured safe app redirect URL", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { calls, handler } = createCheckoutHandler(routeModule, {
    appUrl: "http://attacker.invalid",
    createCheckoutSession: async () => {
      throw new Error("Stripe must not be called with an unsafe app URL.");
    },
  });
  const response = await handler(checkoutRequest({ plan: "monthly" }));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.deepEqual(calls, []);
});

test("Stripe checkout route returns sanitized errors for mocked Stripe failures", async () => {
  const routeModule = await loadStripeCheckoutRouteModule();
  const { handler } = createCheckoutHandler(routeModule, {
    createCheckoutSession: async () => {
      throw new Error("Stripe failed with sk_test_private_fixture");
    },
  });
  const response = await handler(checkoutRequest({ plan: "annual" }));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.doesNotMatch(
    JSON.stringify(body),
    /sk_test_private_fixture|price_annual_synthetic|user_rw_synthetic/,
  );
});

test("Stripe checkout route source stays server-only and metadata-only", async () => {
  const source = await readFile(checkoutRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /createStripeCheckoutRouteHandler/);
  assert.match(source, /requireClerkUserId/);
  assert.match(source, /createStripeBillingContext/);
  assert.match(source, /resolveStripeBillingPlan/);
  assert.match(source, /\bmode:\s*["']subscription["']/);
  assert.match(source, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(source, /\bSTRIPE_SECRET_KEY\b|\bSTRIPE_WEBHOOK_SECRET\b/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);

  for (const privateFragment of [
    "audio",
    "rawTranscript",
    "transcript",
    "cleanedText",
    "clipboard",
    "prompt",
    "payment_method",
    "card",
    "invoice",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${privateFragment}\\b`),
      `checkout route must not reference private/payment field "${privateFragment}"`,
    );
  }
});

async function loadStripeCheckoutRouteModule() {
  const source = await readFile(checkoutRoutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: checkoutRoutePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createRouteModuleRequire(),
    },
    {
      filename: checkoutRoutePath,
    },
  );

  return commonJsModule.exports;
}

function createRouteModuleRequire() {
  return function requireRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@/config/client":
        return { clientEnv: { appUrl: "https://app.rubywhisper.test" } };
      case "@/lib/api/errors":
        return { rubyWhisperApiErrorResponse: createApiErrorResponse };
      case "@/lib/auth/clerk":
        return {
          requireClerkUserId: async () => ({
            ok: true,
            userId: "user_rw_synthetic_member_001",
          }),
        };
      case "@/lib/billing/stripe":
        return {
          createStripeBillingContext: () => ({
            context: {
              apiVersion: validStripeConfig.apiVersion,
              client: mockStripeClient(),
              priceIds: validStripeConfig.priceIds,
            },
            ok: true,
          }),
          normalizeStripeBillingConfig: () => ({
            config: validStripeConfig,
            ok: true,
          }),
          resolveStripeBillingPlan(plan, config) {
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
          },
        };
      default:
        throw new Error(`Unexpected route dependency ${specifier}`);
    }
  };
}

function createCheckoutHandler(routeModule, overrides = {}) {
  const calls = [];
  const client = mockStripeClient();
  const checkoutUrl =
    overrides.checkoutUrl ?? "https://checkout.rubywhisper.test/session/monthly";
  const createCheckoutSession =
    overrides.createCheckoutSession ??
    (async (input, stripeClient) => {
      calls.push({ client: stripeClient, input });

      return {
        url: checkoutUrl,
      };
    });
  const handler = routeModule.createStripeCheckoutRouteHandler({
    appUrl: overrides.appUrl ?? "https://app.rubywhisper.test",
    createCheckoutSession,
    createStripeContext:
      overrides.createStripeContext ??
      (() => ({
        context: {
          apiVersion: validStripeConfig.apiVersion,
          client,
          priceIds: validStripeConfig.priceIds,
        },
        ok: true,
      })),
    requireAuth:
      overrides.requireAuth ??
      (async () => ({
        ok: true,
        userId: "user_rw_synthetic_member_001",
      })),
    resolveBillingConfig:
      overrides.resolveBillingConfig ??
      (() => ({
        config: validStripeConfig,
        ok: true,
      })),
  });

  return { calls, handler };
}

function checkoutRequest(body) {
  return createSyntheticBackendRequest({
    body,
    method: "POST",
    origin: "https://backend.rubywhisper.test",
    path: "/api/stripe/checkout",
  });
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
    kind: "mock-stripe-client",
    checkout: {
      sessions: {
        create: async () => {
          throw new Error("Default Stripe client call must be injected.");
        },
      },
    },
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
