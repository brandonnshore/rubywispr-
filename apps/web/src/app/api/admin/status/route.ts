import { requireRubyWhisperAdminForApi } from "@/lib/admin/api";

export const dynamic = "force-dynamic";

const adminStatusPayload = {
  ok: true,
  service: "rubywhisper-web",
  status: "ok",
  surface: "admin-api",
  version: 1,
} as const;

export async function GET(request: Request) {
  const adminGuard = await requireRubyWhisperAdminForApi({
    request,
    route: "/api/admin/status",
  });

  if (!adminGuard.ok) {
    return adminGuard.response;
  }

  return Response.json(adminStatusPayload, {
    headers: {
      "Cache-Control": "no-store",
    },
    status: 200,
  });
}
