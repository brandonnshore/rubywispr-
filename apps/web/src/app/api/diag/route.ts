import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("x-diag");
  if (auth !== "rubywhisper-diag-2026") {
    return new NextResponse("forbidden", { status: 403 });
  }
  const keys = [
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "DESKTOP_TOKEN_SECRET",
    "CLERK_SECRET_KEY",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ];
  const report = Object.fromEntries(
    keys.map((k) => {
      const value = process.env[k]?.trim();
      return [
        k,
        value === undefined || value === ""
          ? { state: "undefined" }
          : { state: "present" },
      ];
    }),
  );
  return NextResponse.json(
    { ok: true, env: report },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
