import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { serverEnv } from "@/config/server";

export const clerkUnauthenticatedError = {
  code: "clerk_session_required",
  message: "A Clerk user session is required.",
} as const;

export type ClerkAuthenticatedState = {
  ok: true;
  userId: string;
};

export type ClerkUnauthenticatedState = {
  ok: false;
  error: typeof clerkUnauthenticatedError;
};

export type ClerkRequiredAuthState =
  | ClerkAuthenticatedState
  | ClerkUnauthenticatedState;

const isClerkConfigured = Boolean(serverEnv.client.clerkPublishableKey);

export async function requireClerkUserId(): Promise<ClerkRequiredAuthState> {
  if (!isClerkConfigured) {
    return {
      ok: false,
      error: clerkUnauthenticatedError,
    };
  }

  const { userId } = await auth();

  if (!userId) {
    return {
      ok: false,
      error: clerkUnauthenticatedError,
    };
  }

  return {
    ok: true,
    userId,
  };
}

export async function requireClerkUserIdForPage(): Promise<string> {
  const authState = await requireClerkUserId();

  if (!authState.ok) {
    redirect("/sign-in");
  }

  return authState.userId;
}

export function clerkUnauthenticatedJsonResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: clerkUnauthenticatedError,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 401,
    },
  );
}
