import { clientEnv } from "./client";

export const serverRuntimeEnvVariableNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "STRIPE_MONTHLY_PRICE_ID",
  "STRIPE_ANNUAL_PRICE_ID",
  "SENTRY_DSN",
] as const;

export const serverSecretEnvVariableNames = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GROQ_API_KEY",
  "SENTRY_AUTH_TOKEN",
  "APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN",
] as const;

export const serverEnvVariableNames = [
  ...serverRuntimeEnvVariableNames,
  ...serverSecretEnvVariableNames,
] as const;

type ServerEnvVariableName = (typeof serverEnvVariableNames)[number];

const assertServerRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("Server environment config cannot be loaded in the browser.");
  }
};

const readOptionalServerEnv = (name: ServerEnvVariableName) => {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
};

assertServerRuntime();

export const serverEnv = Object.freeze({
  client: clientEnv,
  clerk: {
    secretKey: readOptionalServerEnv("CLERK_SECRET_KEY"),
    webhookSecret: readOptionalServerEnv("CLERK_WEBHOOK_SECRET"),
  },
  supabase: {
    url: readOptionalServerEnv("SUPABASE_URL"),
    anonKey: readOptionalServerEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: readOptionalServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  stripe: {
    secretKey: readOptionalServerEnv("STRIPE_SECRET_KEY"),
    webhookSecret: readOptionalServerEnv("STRIPE_WEBHOOK_SECRET"),
    monthlyPriceId: readOptionalServerEnv("STRIPE_MONTHLY_PRICE_ID"),
    annualPriceId: readOptionalServerEnv("STRIPE_ANNUAL_PRICE_ID"),
  },
  groq: {
    apiKey: readOptionalServerEnv("GROQ_API_KEY"),
  },
  sentry: {
    dsn: readOptionalServerEnv("SENTRY_DSN"),
    authToken: readOptionalServerEnv("SENTRY_AUTH_TOKEN"),
  },
  release: {
    appDownloadSigningKeyOrToken: readOptionalServerEnv(
      "APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN",
    ),
  },
});

export type ServerEnv = typeof serverEnv;
