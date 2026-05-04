import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/config/server";

type StripeApiVersion = NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"];

export const stripeBillingModuleId = "@/lib/billing/stripe" as const;
export const stripeBillingApiVersion =
  "2026-04-22.dahlia" as const satisfies StripeApiVersion;
export const stripeBillingPlans = ["monthly", "annual"] as const;

export type StripeBillingPlan = (typeof stripeBillingPlans)[number];
export type StripeBillingConfigField =
  | "secretKey"
  | "webhookSecret"
  | "monthlyPriceId"
  | "annualPriceId";
export type StripeBillingConfigErrorCode =
  | "stripe_billing_config_missing"
  | "stripe_billing_config_invalid"
  | "stripe_billing_plan_unknown";
export type StripeBillingEnvInput = Readonly<{
  annualPriceId?: string;
  monthlyPriceId?: string;
  secretKey?: string;
  webhookSecret?: string;
}>;
export type StripeWebhookConfigField = "secretKey" | "webhookSecret";
export type StripeWebhookConfigErrorCode =
  | "stripe_webhook_config_missing"
  | "stripe_webhook_config_invalid";
export type StripeWebhookVerificationErrorCode =
  | StripeWebhookConfigErrorCode
  | "stripe_webhook_payload_invalid"
  | "stripe_webhook_signature_invalid"
  | "stripe_webhook_signature_missing";
export type StripeBillingPriceIds = Readonly<Record<StripeBillingPlan, string>>;
export type StripeBillingRuntimeConfig = Readonly<{
  apiVersion: typeof stripeBillingApiVersion;
  priceIds: StripeBillingPriceIds;
}>;
export type StripeWebhookRuntimeConfig = Readonly<{
  apiVersion: typeof stripeBillingApiVersion;
}>;
export type StripeBillingConfigError = Readonly<{
  code: StripeBillingConfigErrorCode;
  invalidFields: readonly StripeBillingConfigField[];
  message: "Stripe billing is not configured for this request.";
  missingFields: readonly StripeBillingConfigField[];
}>;
export type StripeWebhookVerificationError = Readonly<{
  code: StripeWebhookVerificationErrorCode;
  httpStatus: 400 | 503;
  invalidFields: readonly StripeWebhookConfigField[];
  message: "Stripe webhook could not be verified.";
  missingFields: readonly StripeWebhookConfigField[];
}>;
export type StripeBillingConfigResult =
  | Readonly<{
      ok: true;
      config: StripeBillingRuntimeConfig;
    }>
  | Readonly<{
      ok: false;
      error: StripeBillingConfigError;
    }>;
export type StripeWebhookConfigResult =
  | Readonly<{
      ok: true;
      config: StripeWebhookRuntimeConfig;
    }>
  | Readonly<{
      ok: false;
      error: StripeWebhookVerificationError;
    }>;
type StripeBillingClientConfigResult =
  | Readonly<{
      ok: true;
      config: StripeBillingRuntimeConfig;
      secretKey: string;
    }>
  | Readonly<{
      ok: false;
      error: StripeBillingConfigError;
    }>;
type StripeWebhookClientConfigResult =
  | Readonly<{
      ok: true;
      config: StripeWebhookRuntimeConfig;
      secretKey: string;
      webhookSecret: string;
    }>
  | Readonly<{
      ok: false;
      error: StripeWebhookVerificationError;
    }>;
export type StripeBillingContext<Client = Stripe> = Readonly<{
  apiVersion: typeof stripeBillingApiVersion;
  client: Client;
  priceIds: StripeBillingPriceIds;
}>;
export type StripeBillingContextResult<Client = Stripe> =
  | Readonly<{
      ok: true;
      context: StripeBillingContext<Client>;
    }>
  | Readonly<{
      ok: false;
      error: StripeBillingConfigError;
    }>;
export type StripeWebhookEventVerificationResult<Event = Stripe.Event> =
  | Readonly<{
      ok: true;
      event: Event;
    }>
  | Readonly<{
      ok: false;
      error: StripeWebhookVerificationError;
    }>;
export type StripeBillingPlanResult =
  | Readonly<{
      ok: true;
      plan: StripeBillingPlan;
      priceId: string;
    }>
  | Readonly<{
      ok: false;
      error: StripeBillingConfigError;
    }>;
export type StripeBillingClientFactory<Client> = (
  secretKey: string,
  options: Readonly<{ apiVersion: typeof stripeBillingApiVersion }>,
) => Client;
export type StripeWebhookRawBody = string | Buffer;
export type StripeWebhookConstructEvent<
  Client extends StripeWebhookVerifierClient,
  Event,
> = (
  rawBody: StripeWebhookRawBody,
  signatureHeader: string,
  webhookSecret: string,
  client: Client,
) => Event;

type StripeWebhookVerifierClient = Pick<Stripe, "webhooks">;

export const isStripeBillingPlan = (
  value: string,
): value is StripeBillingPlan =>
  stripeBillingPlans.includes(value as StripeBillingPlan);

export const normalizeStripeBillingConfig = (
  env: StripeBillingEnvInput = serverEnv.stripe,
): StripeBillingConfigResult => {
  const result = normalizeStripeBillingClientConfig(env);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    config: result.config,
  };
};

export const normalizeStripeWebhookConfig = (
  env: StripeBillingEnvInput = serverEnv.stripe,
): StripeWebhookConfigResult => {
  const result = normalizeStripeWebhookClientConfig(env);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    config: result.config,
  };
};

const normalizeStripeBillingClientConfig = (
  env: StripeBillingEnvInput,
): StripeBillingClientConfigResult => {
  const secretKey = normalizeOptionalConfigValue(env.secretKey);
  const monthlyPriceId = normalizeOptionalConfigValue(env.monthlyPriceId);
  const annualPriceId = normalizeOptionalConfigValue(env.annualPriceId);
  const missingFields: StripeBillingConfigField[] = [];
  const invalidFields: StripeBillingConfigField[] = [];

  if (!secretKey) {
    missingFields.push("secretKey");
  } else if (!isStripeSecretKey(secretKey)) {
    invalidFields.push("secretKey");
  }

  if (!monthlyPriceId) {
    missingFields.push("monthlyPriceId");
  } else if (!isStripePriceId(monthlyPriceId)) {
    invalidFields.push("monthlyPriceId");
  }

  if (!annualPriceId) {
    missingFields.push("annualPriceId");
  } else if (!isStripePriceId(annualPriceId)) {
    invalidFields.push("annualPriceId");
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    return {
      ok: false,
      error: createStripeBillingConfigError({
        code:
          missingFields.length > 0
            ? "stripe_billing_config_missing"
            : "stripe_billing_config_invalid",
        invalidFields,
        missingFields,
      }),
    };
  }

  return {
    ok: true,
    config: {
      apiVersion: stripeBillingApiVersion,
      priceIds: {
        annual: annualPriceId as string,
        monthly: monthlyPriceId as string,
      },
    },
    secretKey: secretKey as string,
  };
};

const normalizeStripeWebhookClientConfig = (
  env: StripeBillingEnvInput,
): StripeWebhookClientConfigResult => {
  const secretKey = normalizeOptionalConfigValue(env.secretKey);
  const webhookSecret = normalizeOptionalConfigValue(env.webhookSecret);
  const missingFields: StripeWebhookConfigField[] = [];
  const invalidFields: StripeWebhookConfigField[] = [];

  if (!secretKey) {
    missingFields.push("secretKey");
  } else if (!isStripeSecretKey(secretKey)) {
    invalidFields.push("secretKey");
  }

  if (!webhookSecret) {
    missingFields.push("webhookSecret");
  } else if (!isStripeWebhookSecret(webhookSecret)) {
    invalidFields.push("webhookSecret");
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    return {
      ok: false,
      error: createStripeWebhookVerificationError({
        code:
          missingFields.length > 0
            ? "stripe_webhook_config_missing"
            : "stripe_webhook_config_invalid",
        httpStatus: 503,
        invalidFields,
        missingFields,
      }),
    };
  }

  return {
    ok: true,
    config: {
      apiVersion: stripeBillingApiVersion,
    },
    secretKey: secretKey as string,
    webhookSecret: webhookSecret as string,
  };
};

export const createStripeBillingContext = <Client = Stripe>(
  options: Readonly<{
    createClient?: StripeBillingClientFactory<Client>;
    env?: StripeBillingEnvInput;
  }> = {},
): StripeBillingContextResult<Client> => {
  const configResult = normalizeStripeBillingClientConfig(
    options.env ?? serverEnv.stripe,
  );

  if (!configResult.ok) {
    return configResult;
  }

  const createClient =
    options.createClient ??
    (createStripeClient as StripeBillingClientFactory<Client>);

  return {
    ok: true,
    context: {
      apiVersion: configResult.config.apiVersion,
      client: createClient(configResult.secretKey, {
        apiVersion: configResult.config.apiVersion,
      }),
      priceIds: configResult.config.priceIds,
    },
  };
};

export const verifyStripeWebhookEvent = <
  Event = Stripe.Event,
  Client extends StripeWebhookVerifierClient = StripeWebhookVerifierClient,
>(
  input: Readonly<{
    constructEvent?: StripeWebhookConstructEvent<Client, Event>;
    createClient?: StripeBillingClientFactory<Client>;
    env?: StripeBillingEnvInput;
    rawBody: StripeWebhookRawBody;
    signatureHeader?: string | null;
  }>,
): StripeWebhookEventVerificationResult<Event> => {
  const signatureHeader = normalizeOptionalConfigValue(
    input.signatureHeader ?? undefined,
  );

  if (!signatureHeader) {
    return {
      ok: false,
      error: createStripeWebhookVerificationError({
        code: "stripe_webhook_signature_missing",
        httpStatus: 400,
        invalidFields: [],
        missingFields: [],
      }),
    };
  }

  const configResult = normalizeStripeWebhookClientConfig(
    input.env ?? serverEnv.stripe,
  );

  if (!configResult.ok) {
    return configResult;
  }

  const createClient =
    input.createClient ??
    (createStripeClient as unknown as StripeBillingClientFactory<Client>);
  const client = createClient(configResult.secretKey, {
    apiVersion: configResult.config.apiVersion,
  });
  const constructEvent =
    input.constructEvent ?? defaultConstructStripeWebhookEvent;

  try {
    return {
      ok: true,
      event: constructEvent(
        input.rawBody,
        signatureHeader,
        configResult.webhookSecret,
        client,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: createStripeWebhookVerificationError({
        code: isJsonParseError(error)
          ? "stripe_webhook_payload_invalid"
          : "stripe_webhook_signature_invalid",
        httpStatus: 400,
        invalidFields: [],
        missingFields: [],
      }),
    };
  }
};

export const resolveStripeBillingPlan = (
  plan: string,
  config: StripeBillingRuntimeConfig,
): StripeBillingPlanResult => {
  if (!isStripeBillingPlan(plan)) {
    return {
      ok: false,
      error: createStripeBillingConfigError({
        code: "stripe_billing_plan_unknown",
        invalidFields: [],
        missingFields: [],
      }),
    };
  }

  return {
    ok: true,
    plan,
    priceId: config.priceIds[plan],
  };
};

export const createStripeClient: StripeBillingClientFactory<Stripe> = (
  secretKey,
  options,
) =>
  new Stripe(secretKey, {
    apiVersion: options.apiVersion,
    appInfo: {
      name: "RubyWhisper",
      version: "0.1.0",
    },
  });

const normalizeOptionalConfigValue = (value: string | undefined) => {
  const trimmedValue = value?.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
};

const isStripeSecretKey = (value: string) =>
  /^sk_(?:test|live)_[A-Za-z0-9_]+$/.test(value);

const isStripePriceId = (value: string) => /^price_[A-Za-z0-9_]+$/.test(value);

const isStripeWebhookSecret = (value: string) =>
  /^whsec_[A-Za-z0-9_]+$/.test(value);

const defaultConstructStripeWebhookEvent = <
  Event,
  Client extends StripeWebhookVerifierClient,
>(
  rawBody: StripeWebhookRawBody,
  signatureHeader: string,
  webhookSecret: string,
  client: Client,
) =>
  client.webhooks.constructEvent(
    rawBody,
    signatureHeader,
    webhookSecret,
  ) as Event;

const isJsonParseError = (error: unknown) => error instanceof SyntaxError;

const createStripeBillingConfigError = (
  error: Readonly<{
    code: StripeBillingConfigErrorCode;
    invalidFields: readonly StripeBillingConfigField[];
    missingFields: readonly StripeBillingConfigField[];
  }>,
): StripeBillingConfigError => ({
  code: error.code,
  invalidFields: [...error.invalidFields],
  message: "Stripe billing is not configured for this request.",
  missingFields: [...error.missingFields],
});

const createStripeWebhookVerificationError = (
  error: Readonly<{
    code: StripeWebhookVerificationErrorCode;
    httpStatus: 400 | 503;
    invalidFields: readonly StripeWebhookConfigField[];
    missingFields: readonly StripeWebhookConfigField[];
  }>,
): StripeWebhookVerificationError => ({
  code: error.code,
  httpStatus: error.httpStatus,
  invalidFields: [...error.invalidFields],
  message: "Stripe webhook could not be verified.",
  missingFields: [...error.missingFields],
});
