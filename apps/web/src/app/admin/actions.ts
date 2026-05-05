"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { POST as createFriendOfRubyBatch } from "../api/admin/friend-of-ruby/batches/route";

type AdminFriendOfRubyBatchRoutePayload = Readonly<{
  error?: Readonly<{
    code?: unknown;
  }>;
  ok?: unknown;
}>;

export async function createFriendOfRubyBatchFromAdmin(formData: FormData) {
  const response = await createFriendOfRubyBatch(
    new Request(
      "https://app.rubywhisper.local/api/admin/friend-of-ruby/batches",
      {
        body: JSON.stringify(readFriendOfRubyBatchForm(formData)),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ),
  );
  const payload = await readFriendOfRubyBatchRoutePayload(response);

  if (response.status === 201 && payload?.ok === true) {
    revalidatePath("/admin");
    redirect("/admin?friendOfRubyBatch=created");
  }

  redirect(`/admin?friendOfRubyBatch=${resolveFriendOfRubyBatchStatus(response, payload)}`);
}

function readFriendOfRubyBatchForm(formData: FormData) {
  const maxRedemptions = formData.get("maxRedemptions");

  return {
    codeLabel: formData.get("codeLabel"),
    expiresAt: formData.get("expiresAt"),
    maxRedemptions:
      typeof maxRedemptions === "string" ? Number(maxRedemptions) : null,
  };
}

async function readFriendOfRubyBatchRoutePayload(response: Response) {
  const payload = await response.json().catch(() => null);

  return payload && typeof payload === "object"
    ? (payload as AdminFriendOfRubyBatchRoutePayload)
    : null;
}

function resolveFriendOfRubyBatchStatus(
  response: Response,
  payload: AdminFriendOfRubyBatchRoutePayload | null,
) {
  const code = typeof payload?.error?.code === "string"
    ? payload.error.code
    : "";

  if (code === "signed_out") {
    return "signed_out";
  }

  if (response.status === 403 || code === "admin_forbidden") {
    return "forbidden";
  }

  if (code === "admin_friend_of_ruby_batch_invalid") {
    return "invalid";
  }

  if (code === "admin_friend_of_ruby_stripe_failed") {
    return "stripe_unavailable";
  }

  if (code === "admin_friend_of_ruby_batch_create_failed") {
    return "metadata_unavailable";
  }

  return "unavailable";
}
