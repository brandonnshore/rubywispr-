const readOptionalPublicEnv = (value: string | undefined) => {
  const trimmedValue = value?.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
};

export const resolveSafePublicHttpsUrl = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
};

export const clientEnvVariableNames = [
  "NEXT_PUBLIC_RUBYWHISPER_APP_ENV",
  "NEXT_PUBLIC_RUBYWHISPER_APP_URL",
  "NEXT_PUBLIC_RUBYWHISPER_LATEST_APP_DOWNLOAD_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
] as const;

export type ClientEnvVariableName = (typeof clientEnvVariableNames)[number];

export const clientEnv = Object.freeze({
  appEnv: readOptionalPublicEnv(process.env.NEXT_PUBLIC_RUBYWHISPER_APP_ENV),
  appUrl: readOptionalPublicEnv(process.env.NEXT_PUBLIC_RUBYWHISPER_APP_URL),
  latestAppDownloadUrl: resolveSafePublicHttpsUrl(
    readOptionalPublicEnv(
      process.env.NEXT_PUBLIC_RUBYWHISPER_LATEST_APP_DOWNLOAD_URL,
    ),
  ),
  clerkPublishableKey: readOptionalPublicEnv(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ),
});

export type ClientEnv = typeof clientEnv;
