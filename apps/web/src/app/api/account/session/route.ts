import { NextResponse } from "next/server";

import {
  clerkUnauthenticatedJsonResponse,
  requireClerkUserId,
} from "@/lib/auth/clerk";

export async function GET() {
  const authState = await requireClerkUserId();

  if (!authState.ok) {
    return clerkUnauthenticatedJsonResponse();
  }

  return NextResponse.json(
    {
      ok: true,
      userId: authState.userId,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}
