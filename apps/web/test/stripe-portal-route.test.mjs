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
const portalRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "stripe",
  "portal",
  "route.ts",
);
const validStripeConfig = {
  apiVersion: "2026-04-22.dahlia",
  priceIds: {
    annual: "price_annual_synthetic",
    monthly: "price_monthly_synthetic",
  },
};

test("Stripe portal route creates customer portal sessions server-side", async () => {
  const routeModule = await loadStripePortalRouteModule();
  const { calls, handler } = createPortalHandler(routeModule);
  const response = await handler(portalRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    url: "https://billing.rubywhisper.test/session/portal",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].client.kind, "mock-stripe-client");
  assert.deepEqual(toPlainObject(calls[0].input), {
    customer: "cus_rw_synthetic_member_001",
    return_url: "https://app.rubywhisper.test/account?billing=portal_return",
  });
  assert.doesNotMatch(JSON.stringify(body), /cus_rw_synthetic|secret|price_/);
});

test("Stripe portal route returns a clear sanitized response when customer metadata is missing", async () => {
  const routeModule = await loadStripePortalRouteModule();

  for (const customerResult of [
    {
      action: "missing",
      customerMetadata: {
        clerkUserId: "user_rw_synthetic_member_001",
      },
      ok: true,
    },
    {
      action: "found",
      customerMetadata: {
        clerkUserId: "user_rw_synthetic_member_001",
      },
      ok: true,
    },
  ]) {
    const { calls, handler } = createPortalHandler(routeModule, {
      createStripeContext: () => {
        throw new Error("Stripe must not be called without a customer.");
      },
      readCustomerMetadata: async () => customerResult,
    });
    const response = await handler(portalRequest());
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(body, {
      ok: false,
      error: {
        action: "open_checkout_or_contact_support",
        code: "stripe_portal_customer_missing",
        message: "No billing portal is available for this account yet.",
      },
    });
    assert.deepEqual(calls, []);
    assert.doesNotMatch(JSON.stringify(body), /cus_|user_rw_synthetic|secret/);
  }
});

test("Stripe portal route requires authenticated Clerk users", async () => {
  const routeModule = await loadStripePortalRouteModule();
  const { handler } = createPortalHandler(routeModule, {
    readCustomerMetadata: async () => {
      throw new Error("Customer metadata must not be read for signed-out users.");
    },
    requireAuth: async () => ({
      error: {
        code: "clerk_session_required",
        message: "A Clerk user session is required.",
      },
      ok: false,
    }),
  });
  const response = await handler(portalRequest());
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

test("Stripe portal route returns sanitized errors for missing Stripe config", async () => {
  const routeModule = await loadStripePortalRouteModule();
  const { handler } = createPortalHandler(routeModule, {
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
  const response = await handler(portalRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.doesNotMatch(
    JSON.stringify(body),
    /secretKey|STRIPE_|sk_test|cus_rw_synthetic|price_monthly_synthetic/,
  );
});

test("Stripe portal route returns sanitized errors for Supabase read failures", async () => {
  const routeModule = await loadStripePortalRouteModule();
  const { calls, handler } = createPortalHandler(routeModule, {
    createStripeContext: () => {
      throw new Error("Stripe must not be called after metadata read failure.");
    },
    readCustomerMetadata: async () => ({
      error: {
        code: "supabase_subscription_customer_metadata_read_failed",
        message: "Unable to read billing customer metadata.",
      },
      ok: false,
      status: "read_failed",
    }),
  });
  const response = await handler(portalRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.deepEqual(calls, []);
  assert.doesNotMatch(JSON.stringify(body), /supabase|service-role|cus_|user_rw/);
});

test("Stripe portal route requires a configured safe app return URL", async () => {
  const routeModule = await loadStripePortalRouteModule();
  const { calls, handler } = createPortalHandler(routeModule, {
    appUrl: "http://attacker.invalid",
    createPortalSession: async () => {
      throw new Error("Stripe must not be called with an unsafe app URL.");
    },
  });
  const response = await handler(portalRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.deepEqual(calls, []);
});

test("Stripe portal route returns sanitized errors for mocked Stripe failures", async () => {
  const routeModule = await loadStripePortalRouteModule();
  const { handler } = createPortalHandler(routeModule, {
    createPortalSession: async () => {
      throw new Error("Stripe failed with sk_test_private_fixture and cus_rw_synthetic_member_001");
    },
  });
  const response = await handler(portalRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.doesNotMatch(
    JSON.stringify(body),
    /sk_test_private_fixture|cus_rw_synthetic|user_rw_synthetic|price_/,
  );
});

test("Stripe portal route source stays server-only and metadata-only", async () => {
  const source = await readFile(portalRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /createStripePortalRouteHandler/);
  assert.match(source, /requireClerkUserId/);
  assert.match(source, /readRubyWhisperSubscriptionCustomerMetadata/);
  assert.match(source, /createStripeBillingContext/);
  assert.match(source, /\bbillingPortal\b/);
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
      `portal route must not reference private/payment field "${privateFragment}"`,
    );
  }
});

async function loadStripePortalRouteModule() {
  const source = await readFile(portalRoutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: portalRoutePath,
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
      filename: portalRoutePath,
    },
  );

  return commonJsModule.exports;
}

function createRouteModuleRequire() {
  return function requireRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient: () => {
            throw new Error("Default Supabase client call must be injected.");
          },
        };
      case "@/config/client":
        return { clientEnv: { appUrl: "https://app.rubywhisper.test" } };
      case "@/lib/account/subscription-customer-metadata":
        return {
          readRubyWhisperSubscriptionCustomerMetadata: async () => ({
            action: "found",
            customerMetadata: {
              clerkUserId: "user_rw_synthetic_member_001",
              stripeCustomerId: "cus_rw_synthetic_member_001",
            },
            ok: true,
          }),
        };
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
        };
      case "@/lib/supabase/server":
        return {};
      default:
        throw new Error(`Unexpected route dependency ${specifier}`);
    }
  };
}

function createPortalHandler(routeModule, overrides = {}) {
  const calls = [];
  const client = mockStripeClient();
  const portalUrl =
    overrides.portalUrl ?? "https://billing.rubywhisper.test/session/portal";
  const createPortalSession =
    overrides.createPortalSession ??
    (async (input, stripeClient) => {
      calls.push({ client: stripeClient, input });

      return {
        url: portalUrl,
      };
    });
  const handler = routeModule.createStripePortalRouteHandler({
    appUrl: overrides.appUrl ?? "https://app.rubywhisper.test",
    createPortalSession,
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
    readCustomerMetadata:
      overrides.readCustomerMetadata ??
      (async () => ({
        action: "found",
        customerMetadata: {
          clerkUserId: "user_rw_synthetic_member_001",
          stripeCustomerId: "cus_rw_synthetic_member_001",
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

function portalRequest() {
  return createSyntheticBackendRequest({
    body: {
      customer: "cus_attacker_supplied",
      payment_method: "pm_attacker_supplied",
    },
    method: "POST",
    origin: "https://backend.rubywhisper.test",
    path: "/api/stripe/portal",
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
    billingPortal: {
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
