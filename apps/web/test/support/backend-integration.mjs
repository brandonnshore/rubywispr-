import { syntheticBackendFixtures } from "./synthetic-backend-fixtures.mjs";
import {
  assertSyntheticProviderFixtureInput,
  createSyntheticProviderCleanupInput,
  createSyntheticProviderMockClient,
  createSyntheticProviderTranscriptionInput,
  syntheticProviderFixtures,
  syntheticProviderMockScenarios,
} from "./synthetic-provider-mocks.mjs";

export { syntheticBackendFixtures };
export {
  assertSyntheticProviderFixtureInput,
  createSyntheticProviderCleanupInput,
  createSyntheticProviderMockClient,
  createSyntheticProviderTranscriptionInput,
  syntheticProviderFixtures,
  syntheticProviderMockScenarios,
};

const defaultOrigin = "https://rubywhisper-backend.test";
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
      createCompletion: async () => {
        throw new Error("No synthetic provider completion mock was provided.");
      },
      ...overrides.groq,
    },
    provider: overrides.provider ?? createSyntheticProviderMockClient({
      scenario: "timeout",
    }),
  });
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

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  for (const childValue of Object.values(value)) {
    deepFreeze(childValue);
  }

  return Object.freeze(value);
}
