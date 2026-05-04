const readOptionalPublicEnv = (name: ClientEnvVariableName) => {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
};

export const clientEnvVariableNames = [
  "NEXT_PUBLIC_RUBYWHISPER_APP_ENV",
  "NEXT_PUBLIC_RUBYWHISPER_APP_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
] as const;

export type ClientEnvVariableName = (typeof clientEnvVariableNames)[number];

export const clientEnv = Object.freeze({
  appEnv: readOptionalPublicEnv("NEXT_PUBLIC_RUBYWHISPER_APP_ENV"),
  appUrl: readOptionalPublicEnv("NEXT_PUBLIC_RUBYWHISPER_APP_URL"),
  clerkPublishableKey: readOptionalPublicEnv(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ),
});

export type ClientEnv = typeof clientEnv;
