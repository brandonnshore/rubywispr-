import { NextResponse } from "next/server";

import { recordSignedInAccountTermsAcceptance } from "@/app/account/terms-acceptance";

export async function POST() {
  const result = await recordSignedInAccountTermsAcceptance();

  if (result.status === "unauthenticated") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "clerk_session_required",
          message: "A Clerk user session is required.",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 401,
      },
    );
  }

  if (result.status !== "accepted") {
    const status = result.status === "service_unavailable" ? 503 : 409;

    return NextResponse.json(
      {
        ok: false,
        status: result.status,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status,
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: result.status,
      termsAcceptedAt: result.termsAcceptedAt,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}
