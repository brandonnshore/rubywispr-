import type { Metadata } from "next";

import { recordDesktopLoginAttempt } from "@/lib/desktop/login-attempts";

import { AuthRouteShell } from "../../_components/auth-route-shell";

export const metadata: Metadata = {
  title: "Sign up | RubyWhisper",
  description: "Create a RubyWhisper account with an email link.",
};

type SearchParamValue = string | string[] | undefined;
type SearchParams = Promise<Record<string, SearchParamValue>>;

const readParam = (value: SearchParamValue): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const desktop = readParam(params.desktop) === "1";
  const state = readParam(params.state);
  const nonceChallenge = readParam(params.nonce_challenge);

  let forceRedirectUrl: string | undefined;
  if (desktop && state && nonceChallenge) {
    try {
      await recordDesktopLoginAttempt({
        state,
        nonceChallenge,
        platform: readParam(params.platform),
        appVersion: readParam(params.app_version),
        appChannel: readParam(params.app_channel),
      });
      forceRedirectUrl = `/desktop/handoff?state=${encodeURIComponent(state)}`;
    } catch {
      forceRedirectUrl = undefined;
    }
  }

  return <AuthRouteShell mode="sign-up" forceRedirectUrl={forceRedirectUrl} />;
}
