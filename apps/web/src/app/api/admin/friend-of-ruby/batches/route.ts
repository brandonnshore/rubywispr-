import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireRubyWhisperAdminForApi } from "@/lib/admin/api";
import {
  createStripeBillingContext,
  type StripeBillingContextResult,
} from "@/lib/billing/stripe";
import {
  createFriendOfRubyBatchMetadata,
  type CreateFriendOfRubyBatchMetadataInput,
  type CreateFriendOfRubyBatchMetadataResult,
  type SupabaseFriendOfRubyBatchClient,
} from "@/lib/friend-of-ruby/batches";
import {
  createFriendOfRubyStripeCreationRequest,
  createFriendOfRubyStripePromotionCode,
  type CreateFriendOfRubyStripePromotionCodeInput,
  type CreateFriendOfRubyStripePromotionCodeResult,
  type FriendOfRubyStripeClient,
} from "@/lib/friend-of-ruby/stripe";
import type {
  SupabaseServiceRoleClientFactory,
  SupabaseServiceRoleRuntimeConfig,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const adminFriendOfRubyBatchRoute = "/api/admin/friend-of-ruby/batches";

type AdminFriendOfRubyCreateBatchRequestBody = Readonly<{
  code?: unknown;
  codeLabel?: unknown;
  expiresAt?: unknown;
  maxRedemptions?: unknown;
}>;

type AdminFriendOfRubyCreateBatch = Readonly<{
  code: string;
  expiresAt?: string;
  maxRedemptions: number;
}>;

type AdminFriendOfRubyCreateBatchDependencies = Readonly<{
  createBatchClient: SupabaseServiceRoleClientFactory<SupabaseFriendOfRubyBatchClient>;
  createBatchMetadata: (
    input: CreateFriendOfRubyBatchMetadataInput,
    createClient: SupabaseServiceRoleClientFactory<SupabaseFriendOfRubyBatchClient>,
  ) => Promise<CreateFriendOfRubyBatchMetadataResult>;
  createStripeContext: () => StripeBillingContextResult<FriendOfRubyStripeClient>;
  createStripeCreationRequest: typeof createFriendOfRubyStripeCreationRequest;
  createStripePromotionCode: (
    input: CreateFriendOfRubyStripePromotionCodeInput<FriendOfRubyStripeClient>,
  ) => Promise<CreateFriendOfRubyStripePromotionCodeResult>;
  now?: Date | string | (() => Date | string);
  requireAdmin: typeof requireRubyWhisperAdminForApi;
}>;

export function createAdminFriendOfRubyBatchRouteHandler(
  dependencies: AdminFriendOfRubyCreateBatchDependencies,
) {
  return async function POST(request: Request) {
    const adminGuard = await dependencies.requireAdmin({
      request,
      route: adminFriendOfRubyBatchRoute,
    });

    if (!adminGuard.ok) {
      return adminGuard.response;
    }

    const body = await readAdminFriendOfRubyCreateBatchRequestBody(request);
    const batchInput = normalizeAdminFriendOfRubyCreateBatchRequestBody(body);

    if (!batchInput.ok) {
      return adminFriendOfRubyInvalidInputResponse();
    }

    const now = resolveAdminFriendOfRubyNow(dependencies.now);
    const stripePreflight = dependencies.createStripeCreationRequest(
      batchInput.batch,
      now,
    );

    if (!stripePreflight.ok) {
      return adminFriendOfRubyInvalidInputResponse();
    }

    const stripeContext = dependencies.createStripeContext();

    if (!stripeContext.ok) {
      return adminFriendOfRubyStripeFailureResponse();
    }

    const stripeResult = await dependencies.createStripePromotionCode({
      batch: batchInput.batch,
      context: {
        apiVersion: stripeContext.context.apiVersion,
        client: stripeContext.context.client,
      },
      now,
    });

    if (!stripeResult.ok) {
      return stripeResult.status === "coupon_create_failed" ||
        stripeResult.status === "promotion_code_create_failed"
        ? adminFriendOfRubyStripeFailureResponse()
        : adminFriendOfRubyInvalidInputResponse();
    }

    const metadataResult = await dependencies.createBatchMetadata(
      {
        code: batchInput.batch.code,
        createdByClerkUserId: adminGuard.authorization.clerkUserId,
        expiresAt: batchInput.batch.expiresAt ?? null,
        maxRedemptions: batchInput.batch.maxRedemptions,
        stripePromotionCodeId: stripeResult.stripePromotionCodeId,
      },
      dependencies.createBatchClient,
    );

    if (
      !metadataResult.ok ||
      !metadataResult.batch.id ||
      metadataResult.batch.stripePromotionCodeId !==
        stripeResult.stripePromotionCodeId
    ) {
      return metadataResult.ok
        ? adminFriendOfRubySupabaseFailureResponse()
        : metadataResult.status === "create_failed"
          ? adminFriendOfRubySupabaseFailureResponse()
          : adminFriendOfRubyInvalidInputResponse();
    }

    return adminFriendOfRubySuccessResponse({
      codeLabel: metadataResult.batch.code,
      expiresAt: metadataResult.batch.expiresAt ?? null,
      id: metadataResult.batch.id,
      maxRedemptions: metadataResult.batch.maxRedemptions,
      stripePromotionCodeId: metadataResult.batch.stripePromotionCodeId,
    });
  };
}

const defaultAdminFriendOfRubyBatchDependencies: AdminFriendOfRubyCreateBatchDependencies =
  {
    createBatchClient: createAdminFriendOfRubyBatchSupabaseClient,
    createBatchMetadata: createFriendOfRubyBatchMetadata,
    createStripeContext: () =>
      createStripeBillingContext<FriendOfRubyStripeClient>(),
    createStripeCreationRequest: createFriendOfRubyStripeCreationRequest,
    createStripePromotionCode: createFriendOfRubyStripePromotionCode,
    requireAdmin: requireRubyWhisperAdminForApi,
  };

export const POST = createAdminFriendOfRubyBatchRouteHandler(
  defaultAdminFriendOfRubyBatchDependencies,
);

async function readAdminFriendOfRubyCreateBatchRequestBody(
  request: Request,
): Promise<AdminFriendOfRubyCreateBatchRequestBody | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  const body = await request.json().catch(() => null);

  return body && typeof body === "object" ? body : null;
}

function normalizeAdminFriendOfRubyCreateBatchRequestBody(
  body: AdminFriendOfRubyCreateBatchRequestBody | null,
):
  | Readonly<{
      batch: AdminFriendOfRubyCreateBatch;
      ok: true;
    }>
  | Readonly<{
      ok: false;
    }> {
  const codeLabel =
    typeof body?.codeLabel === "string"
      ? body.codeLabel
      : typeof body?.code === "string"
        ? body.code
        : null;

  if (!codeLabel || typeof body?.maxRedemptions !== "number") {
    return { ok: false };
  }

  if (
    body.expiresAt !== undefined &&
    body.expiresAt !== null &&
    body.expiresAt !== "" &&
    typeof body.expiresAt !== "string"
  ) {
    return { ok: false };
  }

  return {
    batch: {
      code: codeLabel,
      ...(typeof body.expiresAt === "string" && body.expiresAt
        ? { expiresAt: body.expiresAt }
        : {}),
      maxRedemptions: body.maxRedemptions,
    },
    ok: true,
  };
}

function resolveAdminFriendOfRubyNow(
  now: AdminFriendOfRubyCreateBatchDependencies["now"],
) {
  return typeof now === "function" ? now() : now;
}

function adminFriendOfRubySuccessResponse(
  batch: Readonly<{
    codeLabel: string;
    expiresAt: string | null;
    id: string;
    maxRedemptions: number;
    stripePromotionCodeId?: string;
  }>,
) {
  return Response.json(
    {
      ok: true,
      batch: {
        id: batch.id,
        codeLabel: batch.codeLabel,
        maxRedemptions: batch.maxRedemptions,
        expiresAt: batch.expiresAt,
        ...(batch.stripePromotionCodeId
          ? { stripePromotionCodeId: batch.stripePromotionCodeId }
          : {}),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 201,
    },
  );
}

function adminFriendOfRubyInvalidInputResponse() {
  return adminFriendOfRubyErrorResponse(
    "admin_friend_of_ruby_batch_invalid",
    "Friend of Ruby batch input is not valid.",
    400,
  );
}

function adminFriendOfRubyStripeFailureResponse() {
  return adminFriendOfRubyErrorResponse(
    "admin_friend_of_ruby_stripe_failed",
    "Unable to create Friend of Ruby promotion code.",
    503,
  );
}

function adminFriendOfRubySupabaseFailureResponse() {
  return adminFriendOfRubyErrorResponse(
    "admin_friend_of_ruby_batch_create_failed",
    "Unable to create Friend of Ruby batch metadata.",
    503,
  );
}

function adminFriendOfRubyErrorResponse(
  code: string,
  message: string,
  status: number,
) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    },
  );
}

function createAdminFriendOfRubyBatchSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): SupabaseFriendOfRubyBatchClient {
  return createSupabaseClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as SupabaseFriendOfRubyBatchClient;
}
