import { NextResponse } from "next/server";

import { recordSignedInAccountTermsAcceptance } from "@/app/account/terms-acceptance";

export async function POST(request: Request) {
  const hasAcknowledgement = await readTermsAcknowledgement(request);

  if (!hasAcknowledgement) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "terms_acknowledgement_required",
          message: "Terms and Privacy acknowledgement is required.",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 400,
      },
    );
  }

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

async function readTermsAcknowledgement(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { termsPrivacyAccepted?: unknown }
      | null;

    return body?.termsPrivacyAccepted === true;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);

    return params.get("termsPrivacyAccepted") === "on";
  }

  return false;
}
