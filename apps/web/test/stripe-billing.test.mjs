import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const helperPath = path.join(webRoot, "src", "lib", "billing", "stripe.ts");
const syntheticStripeSecretKey = ["sk", "test", "rw_synthetic_secret"].join("_");
const validStripeEnv = {
  annualPriceId: " price_annual_synthetic ",
  monthlyPriceId: " price_monthly_synthetic ",
  secretKey: ` ${syntheticStripeSecretKey} `,
};

test("Stripe Node SDK is installed in the web workspace", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(webRoot, "package.json"), "utf8"),
  );

  assert.match(packageJson.dependencies.stripe, /^\^22\.\d+\.\d+$/);
});

test("Stripe billing helper remains server-only and avoids raw env names", async () => {
  const source = await readFile(helperPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']stripe["']/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /\bSTRIPE_SECRET_KEY\b|\bSTRIPE_WEBHOOK_SECRET\b/);
});

test("Stripe billing config normalizes server values without exposing the secret", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.normalizeStripeBillingConfig(validStripeEnv);

  assert.equal(result.ok, true);
  assert.equal(result.config.apiVersion, "2026-04-22.dahlia");
  assert.deepEqual(toPlainValue(result.config.priceIds), {
    annual: "price_annual_synthetic",
    monthly: "price_monthly_synthetic",
  });
  assert.equal("secretKey" in result, false);
});

test("Stripe billing context injects mock clients and keeps outputs metadata-only", async () => {
  const billing = await loadStripeBillingModule();
  const calls = [];
  const mockClient = Object.freeze({ kind: "mock-stripe-client" });
  const result = billing.createStripeBillingContext({
    createClient(secretKey, options) {
      calls.push({ options, secretKey });

      return mockClient;
    },
    env: validStripeEnv,
  });

  assert.equal(result.ok, true);
  assert.equal(result.context.client, mockClient);
  assert.deepEqual(toPlainValue(result.context.priceIds), {
    annual: "price_annual_synthetic",
    monthly: "price_monthly_synthetic",
  });
  assert.deepEqual(toPlainValue(calls), [
    {
      options: { apiVersion: "2026-04-22.dahlia" },
      secretKey: syntheticStripeSecretKey,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result.context), /rw_synthetic_secret/);
});

test("Stripe billing plan lookup allows only monthly and annual plans", async () => {
  const billing = await loadStripeBillingModule();
  const config = billing.normalizeStripeBillingConfig(validStripeEnv).config;

  assert.deepEqual(toPlainValue(billing.stripeBillingPlans), ["monthly", "annual"]);
  assert.deepEqual(toPlainValue(billing.resolveStripeBillingPlan("monthly", config)), {
    ok: true,
    plan: "monthly",
    priceId: "price_monthly_synthetic",
  });
  assert.deepEqual(toPlainValue(billing.resolveStripeBillingPlan("annual", config)), {
    ok: true,
    plan: "annual",
    priceId: "price_annual_synthetic",
  });

  const unknownPlan = billing.resolveStripeBillingPlan("lifetime", config);
  assert.equal(unknownPlan.ok, false);
  assert.deepEqual(toPlainValue(unknownPlan.error), {
    code: "stripe_billing_plan_unknown",
    invalidFields: [],
    message: "Stripe billing is not configured for this request.",
    missingFields: [],
  });
});

test("Stripe billing failures are sanitized for missing or malformed config", async () => {
  const billing = await loadStripeBillingModule();
  const missingResult = billing.createStripeBillingContext({
    env: {
      annualPriceId: "",
      monthlyPriceId: "price_monthly_synthetic",
      secretKey: " ",
    },
  });
  const invalidResult = billing.createStripeBillingContext({
    env: {
      annualPriceId: "price_annual_synthetic",
      monthlyPriceId: "not_a_price_id",
      secretKey: "not_a_secret_key",
    },
  });

  assert.deepEqual(toPlainValue(missingResult), {
    error: {
      code: "stripe_billing_config_missing",
      invalidFields: [],
      message: "Stripe billing is not configured for this request.",
      missingFields: ["secretKey", "annualPriceId"],
    },
    ok: false,
  });
  assert.deepEqual(toPlainValue(invalidResult), {
    error: {
      code: "stripe_billing_config_invalid",
      invalidFields: ["secretKey", "monthlyPriceId"],
      message: "Stripe billing is not configured for this request.",
      missingFields: [],
    },
    ok: false,
  });

  const serializedFailures = JSON.stringify([missingResult, invalidResult]);
  assert.doesNotMatch(serializedFailures, /\bSTRIPE_/);
  assert.doesNotMatch(serializedFailures, /not_a_secret_key|not_a_price_id/);
});

async function loadStripeBillingModule(serverStripeEnv = validStripeEnv) {
  const source = await readFile(helperPath, "utf8");
  const executableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(/import Stripe from "stripe";\n\n/, "")
    .replace(
      /import \{ serverEnv \} from "@\/config\/server";\n\n/,
      "const serverEnv = { stripe: __serverStripeEnv };\n\n",
    );
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  const sandbox = {
    Stripe: class Stripe {},
    __serverStripeEnv: serverStripeEnv,
    exports: cjsModule.exports,
    module: cjsModule,
  };

  vm.runInNewContext(outputText, sandbox, { filename: helperPath });

  return cjsModule.exports;
}

function toPlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}
