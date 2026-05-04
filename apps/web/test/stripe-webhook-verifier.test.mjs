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
const syntheticWebhookSecret = ["whsec", "rw_synthetic_webhook_secret"].join("_");
const validWebhookEnv = {
  secretKey: ` ${syntheticStripeSecretKey} `,
  webhookSecret: ` ${syntheticWebhookSecret} `,
};

test("Stripe webhook verifier stays server-only and uses the SDK constructEvent path", async () => {
  const source = await readFile(helperPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /normalizeStripeWebhookConfig/);
  assert.match(source, /verifyStripeWebhookEvent/);
  assert.match(source, /\.webhooks\.constructEvent\(/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /\bSTRIPE_SECRET_KEY\b|\bSTRIPE_WEBHOOK_SECRET\b/);
  assert.doesNotMatch(source, /\bprocess\.env\b/);
});

test("Stripe webhook config normalizes server values without exposing secrets", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.normalizeStripeWebhookConfig(validWebhookEnv);

  assert.deepEqual(toPlainValue(result), {
    config: {
      apiVersion: "2026-04-22.dahlia",
    },
    ok: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /rw_synthetic|whsec|sk_test/);
});

test("Stripe webhook verifier accepts raw body and signature header", async () => {
  const billing = await loadStripeBillingModule();
  const calls = [];
  const event = {
    id: "evt_rw_synthetic",
    type: "customer.subscription.updated",
  };
  const result = billing.verifyStripeWebhookEvent({
    createClient(secretKey, options) {
      calls.push({ options, secretKey });

      return {
        webhooks: {
          constructEvent(rawBody, signatureHeader, webhookSecret) {
            calls.push({ rawBody, signatureHeader, webhookSecret });

            return event;
          },
        },
      };
    },
    env: validWebhookEnv,
    rawBody: '{"id":"evt_rw_synthetic"}',
    signatureHeader: " t=1700000000,v1=rw_signature ",
  });

  assert.deepEqual(toPlainValue(result), {
    event,
    ok: true,
  });
  assert.deepEqual(toPlainValue(calls), [
    {
      options: { apiVersion: "2026-04-22.dahlia" },
      secretKey: syntheticStripeSecretKey,
    },
    {
      rawBody: '{"id":"evt_rw_synthetic"}',
      signatureHeader: "t=1700000000,v1=rw_signature",
      webhookSecret: syntheticWebhookSecret,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /rw_synthetic_webhook_secret|sk_test/);
});

test("Stripe webhook verifier fails closed for missing config", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.verifyStripeWebhookEvent({
    createClient() {
      throw new Error("Stripe client must not be created with missing config.");
    },
    env: {
      secretKey: " ",
      webhookSecret: "",
    },
    rawBody: "{}",
    signatureHeader: "t=1700000000,v1=rw_signature",
  });

  assert.deepEqual(toPlainValue(result), {
    error: {
      code: "stripe_webhook_config_missing",
      httpStatus: 503,
      invalidFields: [],
      message: "Stripe webhook could not be verified.",
      missingFields: ["secretKey", "webhookSecret"],
    },
    ok: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /\bSTRIPE_|sk_test|whsec_/);
});

test("Stripe webhook verifier fails closed for invalid config", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.verifyStripeWebhookEvent({
    createClient() {
      throw new Error("Stripe client must not be created with invalid config.");
    },
    env: {
      secretKey: "not_a_stripe_secret",
      webhookSecret: "not_a_webhook_secret",
    },
    rawBody: "{}",
    signatureHeader: "t=1700000000,v1=rw_signature",
  });

  assert.deepEqual(toPlainValue(result), {
    error: {
      code: "stripe_webhook_config_invalid",
      httpStatus: 503,
      invalidFields: ["secretKey", "webhookSecret"],
      message: "Stripe webhook could not be verified.",
      missingFields: [],
    },
    ok: false,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /not_a_stripe_secret|not_a_webhook_secret|STRIPE_/,
  );
});

test("Stripe webhook verifier requires the Stripe signature header", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.verifyStripeWebhookEvent({
    createClient() {
      throw new Error("Stripe client must not be created without a signature.");
    },
    env: validWebhookEnv,
    rawBody: "{}",
    signatureHeader: " ",
  });

  assert.deepEqual(toPlainValue(result), {
    error: {
      code: "stripe_webhook_signature_missing",
      httpStatus: 400,
      invalidFields: [],
      message: "Stripe webhook could not be verified.",
      missingFields: [],
    },
    ok: false,
  });
});

test("Stripe webhook verifier maps malformed payloads to sanitized errors", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.verifyStripeWebhookEvent({
    createClient: createThrowingWebhookClient(
      new SyntaxError("Unexpected token with sk_test_private_fixture"),
    ),
    env: validWebhookEnv,
    rawBody: "{not json",
    signatureHeader: "t=1700000000,v1=rw_signature",
  });

  assert.deepEqual(toPlainValue(result), {
    error: {
      code: "stripe_webhook_payload_invalid",
      httpStatus: 400,
      invalidFields: [],
      message: "Stripe webhook could not be verified.",
      missingFields: [],
    },
    ok: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /sk_test_private_fixture|whsec_/);
});

test("Stripe webhook verifier maps verifier exceptions to sanitized signature errors", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.verifyStripeWebhookEvent({
    createClient: createThrowingWebhookClient(
      new Error(
        "No signatures found matching the expected signature for whsec_private_fixture",
      ),
    ),
    env: validWebhookEnv,
    rawBody: "{}",
    signatureHeader: "t=1700000000,v1=bad_signature",
  });

  assert.deepEqual(toPlainValue(result), {
    error: {
      code: "stripe_webhook_signature_invalid",
      httpStatus: 400,
      invalidFields: [],
      message: "Stripe webhook could not be verified.",
      missingFields: [],
    },
    ok: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /whsec_private_fixture|bad_signature/);
});

test("Stripe webhook verifier fails closed when client creation throws", async () => {
  const billing = await loadStripeBillingModule();
  const result = billing.verifyStripeWebhookEvent({
    createClient() {
      throw new Error("Stripe client creation failed with sk_test_private_fixture");
    },
    env: validWebhookEnv,
    rawBody: "{}",
    signatureHeader: "t=1700000000,v1=rw_signature",
  });

  assert.deepEqual(toPlainValue(result), {
    error: {
      code: "stripe_webhook_config_invalid",
      httpStatus: 503,
      invalidFields: ["secretKey"],
      message: "Stripe webhook could not be verified.",
      missingFields: [],
    },
    ok: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /sk_test_private_fixture|whsec_/);
});

async function loadStripeBillingModule(serverStripeEnv = validWebhookEnv) {
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
    Buffer,
    Stripe: class Stripe {},
    __serverStripeEnv: serverStripeEnv,
    exports: cjsModule.exports,
    module: cjsModule,
    SyntaxError,
  };

  vm.runInNewContext(outputText, sandbox, { filename: helperPath });

  return cjsModule.exports;
}

function createThrowingWebhookClient(error) {
  return () => ({
    webhooks: {
      constructEvent() {
        throw error;
      },
    },
  });
}

function toPlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}
