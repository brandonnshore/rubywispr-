import { NextResponse } from "next/server";

const statusPayload = {
  service: "rubywhisper-web",
  status: "ok",
  surface: "api",
  version: 1,
} as const;

export function GET() {
  return NextResponse.json(statusPayload, {
    headers: {
      "Cache-Control": "no-store",
    },
    status: 200,
  });
}
