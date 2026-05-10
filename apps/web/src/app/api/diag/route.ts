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
    "DESKTOP_TOKEN_SECRET",
    "CLERK_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ];
  const report = Object.fromEntries(
    keys.map((k) => {
      const v = process.env[k];
      return [
        k,
        v === undefined
          ? { state: "undefined" }
          : { state: "present", length: v.length, prefix: v.slice(0, 4) },
      ];
    }),
  );
  return NextResponse.json({ ok: true, env: report });
}
