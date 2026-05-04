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
}>;
export type StripeBillingPriceIds = Readonly<Record<StripeBillingPlan, string>>;
export type StripeBillingRuntimeConfig = Readonly<{
  apiVersion: typeof stripeBillingApiVersion;
  priceIds: StripeBillingPriceIds;
}>;
export type StripeBillingConfigError = Readonly<{
  code: StripeBillingConfigErrorCode;
  invalidFields: readonly StripeBillingConfigField[];
  message: "Stripe billing is not configured for this request.";
  missingFields: readonly StripeBillingConfigField[];
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
