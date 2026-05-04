import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSyntheticProviderFixtureInput,
  createMockBackendProviders,
  createSyntheticProviderCleanupInput,
  createSyntheticProviderMockClient,
  createSyntheticProviderTranscriptionInput,
  invokeServerFunction,
  syntheticProviderFixtures,
  syntheticProviderMockScenarios,
} from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const providerMockSupportPath = path.join(
  webRoot,
  "test",
  "support",
  "synthetic-provider-mocks.mjs",
);
const liveOrPrivateProviderFixturePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /https:\/\/api\.groq\.com\b/i,
  /\.env\.local|rubywhisper\.env/,
];

test("backend tests can invoke synthetic provider success through the harness", async () => {
  const result = await invokeServerFunction(
    async (_input, context) => {
      const provider = context.providers.provider;
      const transcription = await provider.transcribe(
        createSyntheticProviderTranscriptionInput(),
      );
      const cleanup = await provider.cleanup(createSyntheticProviderCleanupInput());

      return { cleanup, transcription };
    },
    [{}],
    {
      providers: createMockBackendProviders({
        provider: createSyntheticProviderMockClient({ scenario: "success" }),
      }),
    },
  );

  assert.deepEqual(result, {
    cleanup: {
      ok: true,
      result: syntheticProviderFixtures.cleanupResult,
    },
    transcription: {
      ok: true,
      result: syntheticProviderFixtures.transcriptionResult,
    },
  });
});

test("backend tests can invoke synthetic provider failure scenarios", async () => {
  const expectedCodesByScenario = {
    invalid_response: "provider_invalid_response",
    refusal: "provider_auth_failed",
    timeout: "provider_timeout",
  };

  for (const scenario of syntheticProviderMockScenarios) {
    if (scenario === "success") {
      continue;
    }

    const result = await invokeServerFunction(
      async (_input, context) =>
        context.providers.provider.transcribe(createSyntheticProviderTranscriptionInput()),
      [{}],
      {
        providers: createMockBackendProviders({
          provider: createSyntheticProviderMockClient({ scenario }),
        }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.error.code, expectedCodesByScenario[scenario]);
    assert.equal(result.metadata.provider, "mock_provider");
  }
});

test("provider fixtures reject private content, live hosts, and credential-shaped values", () => {
  const unsafeFixtures = [
    { authorization: ["Bearer", ["sk", "live", "A".repeat(24)].join("_")].join(" ") },
    { endpoint: "https://api.groq.com/openai/v1/audio/transcriptions" },
    { rawAudio: new Uint8Array([1]) },
    { rawTranscript: "private dictation content" },
    { cleanedText: "private cleaned content" },
    { context: "private app context" },
    { dictionaryTerms: ["private vocabulary"] },
    { providerRequestBody: { payload: "must not store" } },
    { secretName: "GROQ_API_KEY" },
  ];

  for (const fixture of unsafeFixtures) {
    assert.throws(
      () => assertSyntheticProviderFixtureInput(fixture, "unsafe provider fixture"),
      /not synthetic/,
    );
  }
});

test("provider mock operation inputs reject raw or non-synthetic content", async () => {
  const provider = createSyntheticProviderMockClient({ scenario: "success" });

  await assert.rejects(
    provider.transcribe({
      ...createSyntheticProviderTranscriptionInput(),
      audio: new Uint8Array(32),
    }),
    /raw audio-like bytes/,
  );
  await assert.rejects(
    provider.cleanup({
      ...createSyntheticProviderCleanupInput(),
      transcriptText: "private dictation content",
    }),
    /non-synthetic transcript text/,
  );
  await assert.rejects(
    provider.cleanup({
      ...createSyntheticProviderCleanupInput(),
      context: "private app context",
    }),
    /provider-private fixture content/,
  );
});

test("provider mock support source stays offline and fixture-only", async () => {
  const source = await readFile(providerMockSupportPath, "utf8");

  for (const pattern of liveOrPrivateProviderFixturePatterns) {
    assert.doesNotMatch(source, pattern);
  }
});
