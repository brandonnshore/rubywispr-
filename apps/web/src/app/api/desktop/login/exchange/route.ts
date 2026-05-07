import "server-only";

import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import { consumeDesktopLoginExchangeCode } from "@/lib/desktop-login/exchange-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DesktopLoginExchangeBody = Readonly<{
  code?: unknown;
  nonce_verifier?: unknown;
  state?: unknown;
}>;

export async function POST(request: Request) {
  const body = await readDesktopLoginExchangeBody(request);

  if (!body) {
    return rubyWhisperApiErrorResponse("signed_out");
  }

  const result = consumeDesktopLoginExchangeCode({
    code: stringBodyValue(body.code),
    nonceVerifier: stringBodyValue(body.nonce_verifier),
    state: stringBodyValue(body.state),
  });

  if (!result.ok) {
    return rubyWhisperApiErrorResponse("signed_out");
  }

  return Response.json(
    {
      ok: true,
      accessToken: result.sessionToken,
      accountID: result.accountId,
      expiresAt: result.sessionExpiresAt,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}

async function readDesktopLoginExchangeBody(request: Request) {
  try {
    return (await request.json()) as DesktopLoginExchangeBody;
  } catch {
    return undefined;
  }
}

function stringBodyValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
