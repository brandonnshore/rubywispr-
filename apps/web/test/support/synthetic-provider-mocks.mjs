const syntheticProviderName = "mock_provider";
const syntheticProviderText = "rw_synthetic_provider_text_001";
const syntheticProviderCleanText = "rw_synthetic_provider_text_001_clean";

export const syntheticProviderMockScenarios = deepFreeze([
  "success",
  "refusal",
  "timeout",
  "invalid_response",
]);

export const syntheticProviderFixtures = deepFreeze({
  providerName: syntheticProviderName,
  cleanupInput: {
    cleanupEnabled: true,
    requestId: "req_rw_synthetic_provider_cleanup_001",
    transcriptText: syntheticProviderText,
  },
  cleanupResult: {
    cleanedText: syntheticProviderCleanText,
    provider: syntheticProviderName,
    providerLatencyMs: 18,
  },
  errors: {
    invalidResponseCode: "provider_invalid_response",
    refusalCode: "provider_auth_failed",
    timeoutCode: "provider_timeout",
  },
  transcriptionInput: {
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
    language: "en",
    requestId: "req_rw_synthetic_provider_transcription_001",
  },
  transcriptionResult: {
    audioDurationMs: 4200,
    provider: syntheticProviderName,
    providerLatencyMs: 24,
    text: syntheticProviderText,
  },
});

const providerErrorDescriptors = {
  provider_auth_failed: {
    apiErrorCode: "service_unavailable",
    code: "provider_auth_failed",
    message: "Provider authentication failed.",
    retryable: false,
  },
  provider_invalid_response: {
    apiErrorCode: "provider_error",
    code: "provider_invalid_response",
    message: "Provider response was invalid.",
    retryable: true,
  },
  provider_timeout: {
    apiErrorCode: "network_error",
    code: "provider_timeout",
    message: "Provider request timed out.",
    retryable: true,
  },
  provider_unavailable: {
    apiErrorCode: "provider_error",
    code: "provider_unavailable",
    message: "Provider is unavailable.",
    retryable: true,
  },
};

const scenarioErrorCodes = {
  invalid_response: "provider_invalid_response",
  refusal: "provider_auth_failed",
  timeout: "provider_timeout",
};

const liveNetworkHostPatterns = [
  /(?:^|\.)clerk\.(?:com|dev)$/i,
  /(?:^|\.)stripe\.com$/i,
  /(?:^|\.)supabase\.(?:co|com)$/i,
  /(?:^|\.)groq\.com$/i,
  /(?:^|\.)sentry\.io$/i,
];
const guardedEnvNames = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GROQ_API_KEY",
  "SENTRY_AUTH_TOKEN",
];
const credentialLikePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
];
const forbiddenProviderFixtureKeyPatterns = [
  /\brawAudio\b/i,
  /\baudio(?:Bytes|Buffer|Data|File|Path|Payload)?\b/i,
  /\brawTranscript\b/i,
  /\btranscript\b/i,
  /\bcleanedText\b/i,
  /\bcontext\b/i,
  /\bdictionaryTerms\b/i,
  /\bprovider(?:Request|Response|Payload)(?:Body|Dump)?\b/i,
  /\bprompt\b/i,
];

export function createSyntheticProviderMockClient(options = {}) {
  assertSyntheticProviderFixtureInput(options, "provider mock options");

  const scenario = options.scenario ?? "success";

  if (!syntheticProviderMockScenarios.includes(scenario)) {
    throw new Error(`Unknown synthetic provider mock scenario: ${scenario}`);
  }

  return deepFreeze({
    cleanup: async (input) => {
      assertSyntheticProviderOperationInput(input, "cleanup input");

      if (scenario === "success") {
        return createProviderSuccess(syntheticProviderFixtures.cleanupResult);
      }

      return createProviderFailure(scenarioErrorCodes[scenario] ?? "provider_unavailable");
    },
    transcribe: async (input) => {
      assertSyntheticProviderOperationInput(input, "transcription input");

      if (scenario === "success") {
        return createProviderSuccess(syntheticProviderFixtures.transcriptionResult);
      }

      return createProviderFailure(scenarioErrorCodes[scenario] ?? "provider_unavailable");
    },
  });
}

export function createSyntheticProviderTranscriptionInput(overrides = {}) {
  assertSyntheticProviderFixtureInput(
    overrides,
    "provider transcription input overrides",
  );

  return deepFreeze({
    audio: new Uint8Array([7]),
    ...syntheticProviderFixtures.transcriptionInput,
    ...overrides,
  });
}

export function createSyntheticProviderCleanupInput(overrides = {}) {
  assertSyntheticProviderFixtureInput(
    overrides,
    "provider cleanup input overrides",
  );

  return deepFreeze({
    ...syntheticProviderFixtures.cleanupInput,
    ...overrides,
  });
}

export function assertSyntheticProviderFixtureInput(value, label = "value") {
  const visited = new WeakSet();
  const violations = [];

  visit(value, label);

  if (violations.length > 0) {
    throw new Error(`Provider fixture ${label} is not synthetic: ${violations.join(", ")}`);
  }

  function visit(currentValue, currentPath) {
    if (currentValue === null || currentValue === undefined) {
      return;
    }

    if (typeof currentValue === "string") {
      collectStringViolations(currentValue, currentPath, violations);
      return;
    }

    if (typeof currentValue === "number" || typeof currentValue === "boolean") {
      return;
    }

    if (typeof currentValue === "function") {
      violations.push(`${currentPath} contains an opaque provider fixture function`);
      return;
    }

    if (currentValue instanceof Headers) {
      visit(Object.fromEntries(currentValue.entries()), currentPath);
      return;
    }

    if (currentValue instanceof URL) {
      collectUrlViolations(currentValue, currentPath, violations);
      return;
    }

    if (isBinaryLikeValue(currentValue)) {
      violations.push(`${currentPath} contains raw audio-like bytes`);
      return;
    }

    if (typeof currentValue !== "object") {
      return;
    }

    if (visited.has(currentValue)) {
      return;
    }

    visited.add(currentValue);

    for (const [key, childValue] of Object.entries(currentValue)) {
      const childPath = `${currentPath}.${key}`;

      if (forbiddenProviderFixtureKeyPatterns.some((pattern) => pattern.test(key))) {
        violations.push(`${childPath} contains provider-private fixture content`);
        continue;
      }

      visit(childValue, childPath);
    }
  }
}

function assertSyntheticProviderOperationInput(value, label) {
  const visited = new WeakSet();
  const violations = [];

  visit(value, label);

  if (violations.length > 0) {
    throw new Error(`Provider mock ${label} is not synthetic: ${violations.join(", ")}`);
  }

  function visit(currentValue, currentPath) {
    if (currentValue === null || currentValue === undefined) {
      return;
    }

    if (typeof currentValue === "string") {
      collectStringViolations(currentValue, currentPath, violations);
      return;
    }

    if (typeof currentValue === "number" || typeof currentValue === "boolean") {
      return;
    }

    if (currentValue instanceof Uint8Array) {
      if (currentValue.byteLength > 16) {
        violations.push(`${currentPath} contains raw audio-like bytes`);
      }

      return;
    }

    if (currentValue instanceof ArrayBuffer || currentValue instanceof Blob) {
      violations.push(`${currentPath} contains raw audio-like bytes`);
      return;
    }

    if (typeof currentValue !== "object") {
      return;
    }

    if (visited.has(currentValue)) {
      return;
    }

    visited.add(currentValue);

    for (const [key, childValue] of Object.entries(currentValue)) {
      const childPath = `${currentPath}.${key}`;

      if (key === "context" || key === "dictionaryTerms") {
        violations.push(`${childPath} contains provider-private fixture content`);
        continue;
      }

      if (key === "transcriptText" && childValue !== syntheticProviderText) {
        violations.push(`${childPath} contains non-synthetic transcript text`);
        continue;
      }

      if (
        /^(?:providerRequestBody|providerResponseBody|providerPayloadDump|rawTranscript|cleanedText)$/i.test(
          key,
        )
      ) {
        violations.push(`${childPath} contains provider-private fixture content`);
        continue;
      }

      visit(childValue, childPath);
    }
  }
}

function createProviderSuccess(result) {
  return deepFreeze({
    ok: true,
    result,
  });
}

function createProviderFailure(code) {
  const descriptor = providerErrorDescriptors[code];

  return deepFreeze({
    error: {
      apiErrorCode: descriptor.apiErrorCode,
      code: descriptor.code,
      message: descriptor.message,
      retryable: descriptor.retryable,
    },
    metadata: {
      provider: syntheticProviderName,
    },
    ok: false,
  });
}

function collectStringViolations(value, label, violations) {
  for (const envName of guardedEnvNames) {
    if (value.includes(envName)) {
      violations.push(`${label} references ${envName}`);
    }
  }

  for (const pattern of credentialLikePatterns) {
    if (pattern.test(value)) {
      violations.push(`${label} looks credential-like`);
    }
  }

  if (/\.env\.local|rubywhisper\.env/.test(value)) {
    violations.push(`${label} references a private env source`);
  }

  if (/^data:audio\//i.test(value) || /\.(?:aac|aiff|flac|m4a|mp3|ogg|wav)\b/i.test(value)) {
    violations.push(`${label} looks audio-like`);
  }

  try {
    collectUrlViolations(new URL(value), label, violations);
  } catch {
    // Most synthetic fixture strings are not URLs.
  }
}

function collectUrlViolations(url, label, violations) {
  for (const pattern of liveNetworkHostPatterns) {
    if (pattern.test(url.hostname)) {
      violations.push(`${label} points at live ${url.hostname}`);
    }
  }
}

function isBinaryLikeValue(value) {
  return (
    value instanceof ArrayBuffer ||
    value instanceof Blob ||
    value instanceof Uint8Array
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (isBinaryLikeValue(value)) {
    return value;
  }

  for (const childValue of Object.values(value)) {
    deepFreeze(childValue);
  }

  return Object.freeze(value);
}
