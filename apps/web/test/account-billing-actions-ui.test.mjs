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
const accountPagePath = path.join(webRoot, "src", "app", "account", "page.tsx");
const accountActionsPath = path.join(
  webRoot,
  "src",
  "app",
  "account",
  "actions.ts",
);

test("signed-in account page renders compact billing actions without provider internals", async () => {
  const pageModule = await loadAccountPageModule();
  const markup = renderToStaticMarkup(
    await pageModule.default({
      searchParams: Promise.resolve({
        billing: "customer_missing",
      }),
    }),
  );
  const source = await readFile(accountPagePath, "utf8");

  assert.match(markup, /Upgrade monthly/);
  assert.match(markup, /Upgrade annual/);
  assert.match(markup, /Manage billing/);
  assert.match(markup, /aria-label="Billing actions"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(
    markup,
    /Billing management is available after a subscription has been created for this account\./,
  );
  assert.doesNotMatch(markup, /\bprice_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(markup, /\bSTRIPE_[A-Z0-9_]+\b/);
  assert.doesNotMatch(markup, /\bcus_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(markup, /\bpayment_method\b|\bcard\b|\binvoice\b/);

  assert.match(source, /startMonthlyCheckout/);
  assert.match(source, /startAnnualCheckout/);
  assert.match(source, /openBillingPortal/);
  assert.match(source, /Upgrade monthly/);
  assert.match(source, /Upgrade annual/);
  assert.match(source, /Manage billing/);
  assert.match(source, /aria-label=["']Billing actions["']/);
  assert.match(source, /role=["']status["']/);
  assert.match(source, /aria-live=["']polite["']/);
  assert.match(source, /checkout_unavailable/);
  assert.match(source, /customer_missing/);
  assert.match(source, /portal_unavailable/);
  assert.doesNotMatch(source, /\bprice_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(source, /\bSTRIPE_[A-Z0-9_]+\b/);
  assert.doesNotMatch(source, /\bcus_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(source, /\bpayment_method\b|\bcard\b|\binvoice\b/);
});

test("account billing actions submit server-owned plans and redirect to returned checkout URLs", async () => {
  const { calls, moduleExports } = await loadAccountActionsModule({
    checkoutResponse: (request) =>
      Response.json({
        ok: true,
        url: `https://checkout.rubywhisper.test/session/${request.plan}`,
      }),
  });

  await assertRejectsRedirect(
    moduleExports.startMonthlyCheckout(),
    "https://checkout.rubywhisper.test/session/monthly",
  );
  await assertRejectsRedirect(
    moduleExports.startAnnualCheckout(),
    "https://checkout.rubywhisper.test/session/annual",
  );

  assert.deepEqual(calls.checkout, [
    {
      plan: "monthly",
    },
    {
      plan: "annual",
    },
  ]);
});

test("account billing actions redirect to portal URLs for existing customers", async () => {
  const { calls, moduleExports } = await loadAccountActionsModule({
    portalResponse: () =>
      Response.json({
        ok: true,
        url: "https://billing.rubywhisper.test/session/portal",
      }),
  });

  await assertRejectsRedirect(
    moduleExports.openBillingPortal(),
    "https://billing.rubywhisper.test/session/portal",
  );

  assert.equal(calls.portal, 1);
});

test("account billing actions map route failures to sanitized account states", async () => {
  const scenarios = [
    {
      action: "startMonthlyCheckout",
      expected: "/account?billing=checkout_unavailable",
      responses: {
        checkoutResponse: () =>
          Response.json(
            {
              error: {
                code: "service_unavailable",
                message: "RubyWhisper is temporarily unavailable.",
              },
              ok: false,
            },
            { status: 503 },
          ),
      },
    },
    {
      action: "openBillingPortal",
      expected: "/account?billing=customer_missing",
      responses: {
        portalResponse: () =>
          Response.json(
            {
              error: {
                code: "stripe_portal_customer_missing",
                message: "No billing portal is available for this account yet.",
              },
              ok: false,
            },
            { status: 409 },
          ),
      },
    },
    {
      action: "openBillingPortal",
      expected: "/account?billing=portal_unavailable",
      responses: {
        portalResponse: () =>
          Response.json(
            {
              error: {
                code: "service_unavailable",
                message: "RubyWhisper is temporarily unavailable.",
              },
              ok: false,
            },
            { status: 503 },
          ),
      },
    },
    {
      action: "openBillingPortal",
      expected: "/account?billing=signed_out",
      responses: {
        portalResponse: () =>
          Response.json(
            {
              error: {
                code: "signed_out",
                message: "Sign in to use RubyWhisper.",
              },
              ok: false,
            },
            { status: 401 },
          ),
      },
    },
  ];

  for (const scenario of scenarios) {
    const { moduleExports } = await loadAccountActionsModule(scenario.responses);

    await assertRejectsRedirect(
      moduleExports[scenario.action](),
      scenario.expected,
    );
  }
});

test("account billing action source avoids client-visible Stripe values", async () => {
  const source = await readFile(accountActionsPath, "utf8");

  assert.match(source, /^["']use server["'];/);
  assert.match(source, /createStripeCheckoutSession/);
  assert.match(source, /createStripePortalSession/);
  assert.match(source, /JSON\.stringify\(\{\s*plan\s*\}\)/);
  assert.match(source, /url\.protocol === ["']https:["']/);
  assert.doesNotMatch(source, /\bprice_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(source, /\bSTRIPE_[A-Z0-9_]+\b/);
  assert.doesNotMatch(source, /\bsk_(?:live|test)_/);
  assert.doesNotMatch(source, /\bcus_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(source, /\bpayment_method\b|\bcard\b|\binvoice\b/);
});

async function loadAccountActionsModule(overrides = {}) {
  const source = await readFile(accountActionsPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: accountActionsPath,
  });
  const calls = {
    checkout: [],
    portal: 0,
  };
  const commonJsModule = { exports: {} };
  const sandbox = {
    FormData,
    Headers,
    Request,
    Response,
    URL,
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createAccountActionsRequire(calls, overrides),
  };

  vm.runInNewContext(outputText, sandbox, { filename: accountActionsPath });

  return {
    calls,
    moduleExports: commonJsModule.exports,
  };
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
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createAccountPageRequire(),
  };

  vm.runInNewContext(outputText, sandbox, { filename: accountPagePath });

  return commonJsModule.exports;
}

function createAccountPageRequire() {
  return function requireAccountPageModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: ({ href, children, ...props }) =>
            requireCommonJs("react").createElement(
              "a",
              { ...props, href },
              children,
            ),
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

function createAccountActionsRequire(calls, overrides) {
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
        return {
          POST: async (request) => {
            const body = await request.json();

            calls.checkout.push(body);

            if (overrides.checkoutResponse) {
              return overrides.checkoutResponse(body);
            }

            return Response.json({
              ok: true,
              url: "https://checkout.rubywhisper.test/session/monthly",
            });
          },
        };
      case "../api/stripe/portal/route":
        return {
          POST: async () => {
            calls.portal += 1;

            if (overrides.portalResponse) {
              return overrides.portalResponse();
            }

            return Response.json({
              ok: true,
              url: "https://billing.rubywhisper.test/session/portal",
            });
          },
        };
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

async function assertRejectsRedirect(promise, expectedUrl) {
  await assert.rejects(
    promise,
    (error) => error?.message === "NEXT_REDIRECT" && error.url === expectedUrl,
  );
}
