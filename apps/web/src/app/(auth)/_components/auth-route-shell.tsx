"use client";

import { ClerkProvider, SignIn, SignUp } from "@clerk/react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { clientEnv } from "@/config/client";

type AuthMode = "sign-in" | "sign-up";

const authCopy = {
  "sign-in": {
    eyebrow: "Email sign-in",
    heading: "Sign in with your email",
    body: "Enter your email to receive a secure link for your RubyWhisper account.",
    label: "Email address",
    submit: "Send sign-in link",
    alternatePrompt: "Need a RubyWhisper account?",
    alternateHref: "/sign-up",
    alternateLabel: "Create one with email",
  },
  "sign-up": {
    eyebrow: "Email sign-up",
    heading: "Create your account with email",
    body: "Use the email address you want tied to RubyWhisper. We will send a secure link to continue.",
    label: "Email address",
    submit: "Send sign-up link",
    alternatePrompt: "Already have an account?",
    alternateHref: "/sign-in",
    alternateLabel: "Sign in with email",
  },
} satisfies Record<AuthMode, AuthRouteCopy>;

const clerkAppearance = {
  elements: {
    rootBox: "clerk-root",
    cardBox: "clerk-card",
  },
  variables: {
    colorPrimary: "var(--rw-color-accent)",
    colorText: "var(--rw-color-text-primary)",
    colorBackground: "var(--rw-color-surface)",
    borderRadius: "var(--rw-radius-medium)",
  },
};

type AuthRouteCopy = {
  eyebrow: string;
  heading: string;
  body: string;
  label: string;
  submit: string;
  alternatePrompt: string;
  alternateHref: string;
  alternateLabel: string;
};

export function AuthClerkProvider({ children }: { children: ReactNode }) {
  if (!clientEnv.clerkPublishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={clientEnv.clerkPublishableKey}
      signInFallbackRedirectUrl="/account"
      signInUrl="/sign-in"
      signUpFallbackRedirectUrl="/account"
      signUpUrl="/sign-up"
    >
      {children}
    </ClerkProvider>
  );
}

export function AuthRouteShell({ mode }: { mode: AuthMode }) {
  const copy = authCopy[mode];
  const searchParams = useSearchParams();
  const isClerkConfigured = Boolean(clientEnv.clerkPublishableKey);
  const desktopLoginRedirectUrl = desktopLoginCallbackRedirectUrl(searchParams);
  const alternateHref = authAlternateHref(copy.alternateHref, searchParams);

  return (
    <main className="surface-shell auth-shell">
      <section className="surface-panel auth-panel" aria-labelledby="auth-heading">
        <p className="surface-kicker">{copy.eyebrow}</p>
        <h1 id="auth-heading">{copy.heading}</h1>
        <p className="surface-copy">{copy.body}</p>

        <div className="auth-card" data-clerk-configured={isClerkConfigured}>
          {isClerkConfigured ? (
            <ClerkAuthComponent
              alternateHref={alternateHref}
              desktopLoginRedirectUrl={desktopLoginRedirectUrl}
              mode={mode}
            />
          ) : (
            <EmailLinkPlaceholder copy={copy} />
          )}
        </div>

        <p className="auth-switch">
          {copy.alternatePrompt}{" "}
          <a href={alternateHref}>{copy.alternateLabel}</a>
        </p>
        <p className="auth-switch">
          Review <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a>{" "}
          before trial dictation. Need help? <a href="/support">Support</a>.
        </p>
      </section>
    </main>
  );
}

function ClerkAuthComponent({
  alternateHref,
  desktopLoginRedirectUrl,
  mode,
}: {
  alternateHref: string;
  desktopLoginRedirectUrl?: string;
  mode: AuthMode;
}) {
  const redirectUrl = desktopLoginRedirectUrl ?? "/account";

  if (mode === "sign-up") {
    return (
      <SignUp
        appearance={clerkAppearance}
        fallbackRedirectUrl={redirectUrl}
        forceRedirectUrl={desktopLoginRedirectUrl}
        path="/sign-up"
        routing="path"
        signInForceRedirectUrl={desktopLoginRedirectUrl}
        signInUrl={alternateHref}
      />
    );
  }

  return (
    <SignIn
      appearance={clerkAppearance}
      fallbackRedirectUrl={redirectUrl}
      forceRedirectUrl={desktopLoginRedirectUrl}
      path="/sign-in"
      routing="path"
      signUpFallbackRedirectUrl={redirectUrl}
      signUpForceRedirectUrl={desktopLoginRedirectUrl}
      signUpUrl={alternateHref}
      withSignUp
    />
  );
}

function desktopLoginCallbackRedirectUrl(searchParams: URLSearchParams) {
  if (
    searchParams.get("desktop") !== "1" ||
    searchParams.get("handoff") !== "callback"
  ) {
    return undefined;
  }

  const state = searchParams.get("state")?.trim();
  const nonceChallenge = searchParams.get("nonce_challenge")?.trim();
  const callbackScheme =
    searchParams.get("callback_scheme")?.trim() || "rubywhisper";

  if (!state || !nonceChallenge || callbackScheme !== "rubywhisper") {
    return undefined;
  }

  const callbackParams = new URLSearchParams({
    callback_scheme: callbackScheme,
    nonce_challenge: nonceChallenge,
    state,
  });

  return `/api/desktop/login/callback?${callbackParams.toString()}`;
}

function authAlternateHref(path: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function EmailLinkPlaceholder({ copy }: { copy: AuthRouteCopy }) {
  return (
    <form className="email-auth-form" aria-describedby="auth-placeholder-note">
      <label htmlFor="email-auth-address">{copy.label}</label>
      <input
        autoComplete="email"
        disabled
        id="email-auth-address"
        inputMode="email"
        name="email"
        placeholder="you@example.com"
        type="email"
      />
      <button disabled type="submit">
        {copy.submit}
      </button>
      <p id="auth-placeholder-note">
        Email link delivery turns on when the Clerk publishable key is configured.
      </p>
    </form>
  );
}
