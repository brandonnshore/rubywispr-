import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoLiveBackendIntegrationInput,
  assertNoPrivateProviderFixtureInput,
  createMockBackendProviders,
  createMockProviderClient,
  createSyntheticBackendRequest,
  createSyntheticProviderFailure,
  createSyntheticProviderTranscriptionSuccess,
  invokeRouteHandler,
  invokeServerFunction,
  syntheticBackendFixtures,
} from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const fixturesPath = path.join(
  webRoot,
  "test",
  "support",
  "synthetic-backend-fixtures.mjs",
);
const syntheticEmailPattern = /^[^@\s]+@(?:example\.com|[A-Za-z0-9.-]+\.test)$/;
const forbiddenFixtureSourcePatterns = [
  /\baudio\b/i,
  /\btranscript\b/i,
  /\bcleaned(?:_|-)?text\b/i,
  /\bclipboard\b/i,
  /\bdictionary(?:_|-)?terms?\b/i,
  /\bapp(?:_|-)?context\b/i,
  /\blocal(?:_|-)?history\b/i,
  /\bmagic(?:_|-)?link\b/i,
  /\bprocess\.env\b/,
  /\.env\.local|rubywhisper\.env/,
];
const credentialLikeFixturePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
];

test("backend integration helper invokes synthetic route handlers", async () => {
  const response = await invokeRouteHandler(
    {
      GET(request) {
        return Response.json({
          fixture: request.headers.get("x-rubywhisper-test-fixture"),
          search: new URL(request.url).searchParams.get("health"),
          userId: syntheticBackendFixtures.clerk.memberUserId,
        });
      },
    },
    {
      method: "GET",
      path: "/api/status",
      searchParams: { health: true },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    fixture: "synthetic",
    search: "true",
    userId: "user_rw_synthetic_member_001",
  });
});

test("backend integration helper invokes synthetic server functions", async () => {
  const result = await invokeServerFunction(
    (input, context) => ({
      email: context.auth.email,
      planState: input.planState,
      provider: context.providers.groq.name,
    }),
    [{ planState: syntheticBackendFixtures.supabase.profile.plan_state }],
    {
      providers: createMockBackendProviders({
        groq: {
          name: syntheticBackendFixtures.provider.successMetadata.provider,
        },
      }),
    },
  );

  assert.deepEqual(result, {
    email: "member.alpha@example.com",
    planState: "trial_active",
    provider: "mock_provider",
  });
});

test("backend integration helpers reject live-looking inputs", () => {
  assert.throws(
    () => createSyntheticBackendRequest({ path: "https://api.stripe.com/v1/customers" }),
    /not synthetic/,
  );
  assert.throws(
    () =>
      createSyntheticBackendRequest({
        headers: {
          authorization: ["Bearer", ["sk", "live", "A".repeat(24)].join("_")].join(" "),
        },
      }),
    /not synthetic/,
  );
  assert.throws(
    () => assertNoLiveBackendIntegrationInput("CLERK_SECRET_KEY", "fixture"),
    /not synthetic/,
  );
});

test("mock backend providers fail closed unless a synthetic override is supplied", async () => {
  const providers = createMockBackendProviders();

  await assert.rejects(
    providers.groq.createCompletion(),
    /No synthetic provider completion mock was provided/,
  );
  assert.deepEqual(await providers.providerClient.transcribe(), {
    error: {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      message: "Synthetic provider is unavailable.",
      retryable: true,
    },
    metadata: {
      provider: "mock_provider",
    },
    ok: false,
  });

  const overriddenProviders = createMockBackendProviders({
    supabase: {
      from(tableName) {
        return {
          tableName,
          rows: [syntheticBackendFixtures.supabase.profile],
        };
      },
    },
  });

  assert.deepEqual(overriddenProviders.supabase.from("profiles"), {
    rows: [syntheticBackendFixtures.supabase.profile],
    tableName: "profiles",
  });
});

test("mock provider helpers cover synthetic success and failure scenarios", async () => {
  const providerClient = createMockProviderClient({
    transcribe: async () =>
      createSyntheticProviderTranscriptionSuccess({
        audioDurationMs: 4200,
        providerLatencyMs: 32,
      }),
  });
  const success = await providerClient.transcribe();
  const timeoutFailure = createSyntheticProviderFailure({
    code: "provider_timeout",
    providerLatencyMs: 225,
    totalLatencyMs: 5_000,
  });
  const invalidResponseFailure = createSyntheticProviderFailure({
    code: "provider_invalid_response",
  });
  const requestFailure = createSyntheticProviderFailure({
    code: "invalid_request",
  });

  assert.deepEqual(success, {
    ok: true,
    result: {
      audioDurationMs: 4200,
      provider: "mock_provider",
      providerLatencyMs: 32,
      text: "synthetic provider output",
    },
  });
  assert.equal(timeoutFailure.error.apiErrorCode, "network_error");
  assert.equal(timeoutFailure.error.code, "provider_timeout");
  assert.equal(timeoutFailure.error.retryable, true);
  assert.deepEqual(timeoutFailure.metadata, {
    provider: "mock_provider",
    providerLatencyMs: 225,
    totalLatencyMs: 5_000,
  });
  assert.equal(invalidResponseFailure.error.code, "provider_invalid_response");
  assert.equal(invalidResponseFailure.error.apiErrorCode, "provider_error");
  assert.equal(requestFailure.error.code, "invalid_request");
  assert.equal(requestFailure.error.retryable, false);
});

test("provider fixture guardrails reject private provider payload fields", () => {
  const privateProviderFixtures = [
    { audio: "synthetic payload must still stay out of fixtures" },
    { rawTranscript: "synthetic payload must still stay out of fixtures" },
    { cleanedText: "synthetic payload must still stay out of fixtures" },
    { context: "synthetic payload must still stay out of fixtures" },
    { dictionaryTerms: ["term_placeholder_alpha"] },
    { providerRequestBody: { prompt: "synthetic payload" } },
    { result: { text: "synthetic payload must still stay out of fixtures" } },
  ];

  for (const fixture of privateProviderFixtures) {
    assert.throws(
      () => assertNoPrivateProviderFixtureInput(fixture, "provider fixture"),
      /not provider-fixture safe/,
    );
    assert.throws(
      () => createMockProviderClient(fixture),
      /not provider-fixture safe/,
    );
  }
});

test("synthetic backend fixtures contain only placeholder emails", () => {
  const emails = collectFixtureStrings(syntheticBackendFixtures).filter((value) =>
    value.includes("@"),
  );

  assert.ok(emails.length >= 2);

  for (const email of emails) {
    assert.match(email, syntheticEmailPattern, `${email} must use a placeholder domain`);
  }
});

test("synthetic backend fixtures avoid payload fields, credentials, and private env sources", async () => {
  const fixtureSource = await readFile(fixturesPath, "utf8");
  const fixtureValues = collectFixtureStrings(syntheticBackendFixtures);

  for (const pattern of forbiddenFixtureSourcePatterns) {
    assert.doesNotMatch(
      fixtureSource,
      pattern,
      `fixtures must not contain source pattern ${pattern}`,
    );
  }

  for (const value of fixtureValues) {
    for (const pattern of credentialLikeFixturePatterns) {
      assert.doesNotMatch(
        value,
        pattern,
        `fixture value ${value} must not look credential-like`,
      );
    }
  }
});

function collectFixtureStrings(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectFixtureStrings);
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap(collectFixtureStrings);
  }

  return [];
}
