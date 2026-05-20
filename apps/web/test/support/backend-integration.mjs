import { syntheticBackendFixtures } from "./synthetic-backend-fixtures.mjs";

export { syntheticBackendFixtures };

const defaultOrigin = "https://rubywhisper-backend.test";
const liveNetworkHostPatterns = [
  /(?:^|\.)clerk\.(?:com|dev)$/i,
  /(?:^|\.)stripe\.com$/i,
  /(?:^|\.)supabase\.(?:co|com)$/i,
  /(?:^|\.)groq\.com$/i,
  /(?:^|\.)openai\.com$/i,
  /(?:^|\.)sentry\.io$/i,
];
const guardedEnvNames = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DESKTOP_TOKEN_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "SENTRY_AUTH_TOKEN",
];
const credentialLikePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
];
const syntheticProviderName = "mock_provider";
const syntheticProviderOutput = "synthetic provider output";
const safeProviderFixtureKeys = new Set([
  "api_error_code",
  "audio_duration_ms",
  "cleanup",
  "code",
  "create_completion",
  "error",
  "metadata",
  "name",
  "ok",
  "output_word_count",
  "provider",
  "provider_client",
  "provider_latency_ms",
  "result",
  "retry_after_seconds",
  "retryable",
  "total_latency_ms",
  "transcribe",
]);
const privateProviderFixtureKeyPatterns = [
  /^(?:raw_)?audio$/,
  /^audio_(?:blob|body|buffer|bytes|content|data|file|input|payload)$/,
  /^(?:blob|buffer|file)$/,
  /^(?:raw_)?transcript(?:_text)?$/,
  /^transcription_(?:body|data|input|payload|result)$/,
  /^cleaned_text$/,
  /^final_text$/,
  /^(?:app_)?context$/,
  /^dictionary(?:_terms?)?$/,
  /^provider_(?:request|response)(?:_body|_data|_payload)?$/,
  /^(?:request|response)_(?:body|data|payload)$/,
  /^(?:message|messages|prompt|text)$/,
  /^(?:clipboard|local_history|recent_wisprs?|server_history_id)$/,
  /^(?:authorization|cookie|headers?)$/,
  /^(?:jwt|secret|session|token)$/,
];
const syntheticProviderErrorDescriptors = {
  invalid_request: {
    apiErrorCode: "invalid_audio",
    message: "Synthetic provider request was invalid.",
    retryable: false,
  },
  missing_config: {
    apiErrorCode: "service_unavailable",
    message: "Synthetic provider configuration is unavailable.",
    retryable: false,
  },
  network_error: {
    apiErrorCode: "network_error",
    message: "Synthetic provider network request failed.",
    retryable: true,
  },
  provider_auth_failed: {
    apiErrorCode: "service_unavailable",
    message: "Synthetic provider authentication failed.",
    retryable: false,
  },
  provider_invalid_response: {
    apiErrorCode: "provider_error",
    message: "Synthetic provider response was invalid.",
    retryable: true,
  },
  provider_rate_limited: {
    apiErrorCode: "rate_limited",
    message: "Synthetic provider rate limit was reached.",
    retryable: true,
  },
  provider_timeout: {
    apiErrorCode: "network_error",
    message: "Synthetic provider request timed out.",
    retryable: true,
  },
  provider_unavailable: {
    apiErrorCode: "provider_error",
    message: "Synthetic provider is unavailable.",
    retryable: true,
  },
  unknown_provider_error: {
    apiErrorCode: "provider_error",
    message: "Synthetic provider request failed.",
    retryable: true,
  },
};

export function createSyntheticBackendRequest(options = {}) {
  const {
    body,
    headers = {},
    method = "GET",
    origin = defaultOrigin,
    path = "/api/synthetic",
    searchParams,
  } = options;
  const url = buildSyntheticUrl({ origin, path, searchParams });
  const requestHeaders = new Headers(headers);

  requestHeaders.set("x-rubywhisper-test-fixture", "synthetic");

  const init = {
    headers: requestHeaders,
    method,
  };

  if (body !== undefined) {
    assertNoLiveBackendIntegrationInput(body, "request body");
    init.body = typeof body === "string" ? body : JSON.stringify(body);

    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  assertNoLiveBackendIntegrationInput(
    {
      headers: Object.fromEntries(requestHeaders.entries()),
      method,
      url: url.href,
    },
    "request",
  );

  return new Request(url, init);
}

export async function invokeRouteHandler(routeHandler, options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const handler =
    typeof routeHandler === "function" ? routeHandler : routeHandler?.[method];

  if (typeof handler !== "function") {
    throw new TypeError(`No ${method} route handler was provided.`);
  }

  const request = createSyntheticBackendRequest({ ...options, method });
  const context = createSyntheticRouteContext(options.context);

  return handler(request, context);
}

export async function invokeServerFunction(serverFunction, args = [], context = {}) {
  if (typeof serverFunction !== "function") {
    throw new TypeError("A server function is required.");
  }

  assertNoLiveBackendIntegrationInput(args, "server function arguments");
  assertNoLiveBackendIntegrationInput(context, "server function context");

  return serverFunction(...args, createSyntheticServerContext(context));
}

export function createSyntheticRouteContext(overrides = {}) {
  assertNoLiveBackendIntegrationInput(overrides, "route context overrides");

  return {
    params: {},
    ...overrides,
  };
}

export function createSyntheticServerContext(overrides = {}) {
  assertNoLiveBackendIntegrationInput(overrides, "server context overrides");

  return deepFreeze({
    auth: {
      userId: syntheticBackendFixtures.clerk.memberUserId,
      sessionId: syntheticBackendFixtures.clerk.memberSessionId,
      email: syntheticBackendFixtures.clerk.memberEmail,
    },
    providers: createMockBackendProviders(),
    ...overrides,
  });
}

export function createMockBackendProviders(overrides = {}) {
  assertNoLiveBackendIntegrationInput(overrides, "provider overrides");
  assertNoPrivateProviderFixtureInput(
    overrides.providerClient,
    "provider client overrides",
  );
  assertNoPrivateProviderFixtureInput(overrides.groq, "Groq provider overrides");
  const providerClient = createMockProviderClient(overrides.providerClient);

  return deepFreeze({
    clerk: {
      getUser: async () => {
        throw new Error("No synthetic Clerk getUser mock was provided.");
      },
      ...overrides.clerk,
    },
    stripe: {
      createCheckoutSession: async () => {
        throw new Error("No synthetic Stripe checkout mock was provided.");
      },
      ...overrides.stripe,
    },
    supabase: {
      from: () => {
        throw new Error("No synthetic Supabase table mock was provided.");
      },
      ...overrides.supabase,
    },
    groq: {
      cleanup: providerClient.cleanup,
      createCompletion: async () => {
        throw new Error("No synthetic provider completion mock was provided.");
      },
      name: syntheticProviderName,
      transcribe: providerClient.transcribe,
      ...overrides.groq,
    },
    providerClient,
  });
}

export function createMockProviderClient(overrides = {}) {
  assertNoLiveBackendIntegrationInput(overrides, "provider client overrides");
  assertNoPrivateProviderFixtureInput(overrides, "provider client overrides");

  return deepFreeze({
    cleanup:
      overrides.cleanup ??
      (async () =>
        createSyntheticProviderFailure({
          code: "provider_unavailable",
        })),
    transcribe:
      overrides.transcribe ??
      (async () =>
        createSyntheticProviderFailure({
          code: "provider_unavailable",
        })),
  });
}

export function createSyntheticProviderTranscriptionSuccess(options = {}) {
  assertNoLiveBackendIntegrationInput(options, "provider success options");
  assertNoPrivateProviderFixtureInput(options, "provider success options");

  return deepFreeze({
    ok: true,
    result: {
      ...(isFiniteNumber(options.audioDurationMs)
        ? { audioDurationMs: options.audioDurationMs }
        : {}),
      provider: syntheticProviderName,
      providerLatencyMs: isFiniteNumber(options.providerLatencyMs)
        ? options.providerLatencyMs
        : syntheticBackendFixtures.provider.successMetadata.latency_ms,
      text: syntheticProviderOutput,
    },
  });
}

export function createSyntheticProviderFailure(options = {}) {
  assertNoLiveBackendIntegrationInput(options, "provider failure options");
  assertNoPrivateProviderFixtureInput(options, "provider failure options");

  const requestedCode = options.code ?? "provider_unavailable";
  const code = syntheticProviderErrorDescriptors[requestedCode]
    ? requestedCode
    : "unknown_provider_error";
  const descriptor = syntheticProviderErrorDescriptors[code];
  const metadata = {
    provider: syntheticProviderName,
    ...(isFiniteNumber(options.providerLatencyMs)
      ? { providerLatencyMs: options.providerLatencyMs }
      : {}),
    ...(isFiniteNumber(options.retryAfterSeconds)
      ? { retryAfterSeconds: options.retryAfterSeconds }
      : {}),
    ...(isFiniteNumber(options.totalLatencyMs)
      ? { totalLatencyMs: options.totalLatencyMs }
      : {}),
  };

  return deepFreeze({
    error: {
      apiErrorCode: descriptor.apiErrorCode,
      code,
      message: descriptor.message,
      retryable: descriptor.retryable,
    },
    metadata,
    ok: false,
  });
}

export function assertNoPrivateProviderFixtureInput(value, label = "value") {
  assertNoLiveBackendIntegrationInput(value, label);

  const visited = new WeakSet();
  const violations = [];

  visit(value, label);

  if (violations.length > 0) {
    throw new Error(
      `Backend integration ${label} is not provider-fixture safe: ${violations.join(", ")}`,
    );
  }

  function visit(currentValue, currentPath) {
    if (currentValue === null || currentValue === undefined) {
      return;
    }

    if (
      typeof currentValue === "string" ||
      typeof currentValue === "number" ||
      typeof currentValue === "boolean" ||
      typeof currentValue === "function"
    ) {
      return;
    }

    if (currentValue instanceof Headers || currentValue instanceof URL) {
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
      const normalizedKey = normalizeProviderFixtureKey(key);

      if (
        !safeProviderFixtureKeys.has(normalizedKey) &&
        privateProviderFixtureKeyPatterns.some((pattern) =>
          pattern.test(normalizedKey),
        )
      ) {
        violations.push(`${currentPath}.${key} uses private provider field ${key}`);
      }

      visit(childValue, `${currentPath}.${key}`);
    }
  }
}

export function assertNoLiveBackendIntegrationInput(value, label = "value") {
  const visited = new WeakSet();
  const violations = [];

  visit(value, label);

  if (violations.length > 0) {
    throw new Error(`Backend integration ${label} is not synthetic: ${violations.join(", ")}`);
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

    if (typeof currentValue !== "object") {
      return;
    }

    if (visited.has(currentValue)) {
      return;
    }

    visited.add(currentValue);

    for (const [key, childValue] of Object.entries(currentValue)) {
      visit(childValue, `${currentPath}.${key}`);
    }
  }
}

function buildSyntheticUrl({ origin, path, searchParams }) {
  const url = new URL(path, origin);

  collectUrlViolations(url, "request URL", []);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
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

  try {
    collectUrlViolations(new URL(value), label, violations);
  } catch {
    // Most fixture strings are not URLs.
  }
}

function collectUrlViolations(url, label, violations) {
  for (const pattern of liveNetworkHostPatterns) {
    if (pattern.test(url.hostname)) {
      violations.push(`${label} points at live ${url.hostname}`);
    }
  }
}

function normalizeProviderFixtureKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  for (const childValue of Object.values(value)) {
    deepFreeze(childValue);
  }

  return Object.freeze(value);
}
