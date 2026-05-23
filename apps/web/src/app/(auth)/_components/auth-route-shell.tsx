"use client";

import { ClerkProvider, SignIn, SignUp } from "@clerk/react";
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
    colorPrimary: "#d2546b",
    colorText: "#17171b",
    colorTextSecondary: "rgb(23 23 27 / 68%)",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#17171b",
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

export function AuthRouteShell({
  mode,
  forceRedirectUrl,
}: {
  mode: AuthMode;
  forceRedirectUrl?: string;
}) {
  const copy = authCopy[mode];
  const isClerkConfigured = Boolean(clientEnv.clerkPublishableKey);

  return (
    <main className="surface-shell auth-shell">
      <section className="surface-panel auth-panel" aria-labelledby="auth-heading">
        <p className="surface-kicker">{copy.eyebrow}</p>
        <h1 id="auth-heading">{copy.heading}</h1>
        <p className="surface-copy">{copy.body}</p>

        <div className="auth-card" data-clerk-configured={isClerkConfigured}>
          {isClerkConfigured ? (
            <ClerkAuthComponent mode={mode} forceRedirectUrl={forceRedirectUrl} />
          ) : (
            <EmailLinkPlaceholder copy={copy} />
          )}
        </div>

        <p className="auth-switch">
          {copy.alternatePrompt}{" "}
          <a href={copy.alternateHref}>{copy.alternateLabel}</a>
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
  mode,
  forceRedirectUrl,
}: {
  mode: AuthMode;
  forceRedirectUrl?: string;
}) {
  const fallbackRedirectUrl = forceRedirectUrl ?? "/account";

  if (mode === "sign-up") {
    return (
      <SignUp
        appearance={clerkAppearance}
        fallbackRedirectUrl={fallbackRedirectUrl}
        forceRedirectUrl={forceRedirectUrl}
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    );
  }

  return (
    <SignIn
      appearance={clerkAppearance}
      fallbackRedirectUrl={fallbackRedirectUrl}
      forceRedirectUrl={forceRedirectUrl}
      path="/sign-in"
      routing="path"
      signUpFallbackRedirectUrl={fallbackRedirectUrl}
      signUpForceRedirectUrl={forceRedirectUrl}
      signUpUrl="/sign-up"
      withSignUp
    />
  );
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
