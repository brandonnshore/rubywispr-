import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const handoffRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "desktop",
  "handoff",
  "route.ts",
);

test("desktop handoff redirects blank Clerk config through sign-in with state intact", async () => {
  const route = await loadHandoffRouteModule({
    clerkPublishableKey: undefined,
    currentUser: () => {
      throw new Error("currentUser must not be called without Clerk config.");
    },
  });

  const response = await route.GET(
    createRequest("http://localhost:3000/desktop/handoff?state=rw_state&desktop=1"),
  );
  const location = new URL(response.headers.get("Location"));

  assert.equal(response.status, 302);
  assert.equal(location.pathname, "/sign-in");
  assert.equal(location.searchParams.get("state"), "rw_state");
  assert.equal(location.searchParams.get("desktop"), "1");
});

test("desktop handoff treats Clerk helper failures as signed-out redirect", async () => {
  const route = await loadHandoffRouteModule({
    clerkPublishableKey: "pk_test_synthetic",
    currentUser: () => {
      throw new Error("Clerk middleware unavailable.");
    },
  });

  const response = await route.GET(
    createRequest("http://localhost:3000/desktop/handoff?state=rw_state"),
  );
  const location = new URL(response.headers.get("Location"));

  assert.equal(response.status, 302);
  assert.equal(location.pathname, "/sign-in");
  assert.equal(location.searchParams.get("state"), "rw_state");
});

test("desktop handoff returns controlled errors before auth or backend work", async () => {
  const calls = [];
  const route = await loadHandoffRouteModule({
    currentUser: () => {
      calls.push("currentUser");
      return null;
    },
  });

  const response = await route.GET(
    createRequest("http://localhost:3000/desktop/handoff"),
  );
  const location = new URL(response.headers.get("Location"));

  assert.equal(response.status, 302);
  assert.equal(location.pathname, "/sign-in");
  assert.equal(location.searchParams.get("error"), "missing_state");
  assert.deepEqual(calls, []);
});

test("desktop handoff issues a callback URL for a valid signed-in attempt", async () => {
  const calls = [];
  const route = await loadHandoffRouteModule({
    attachClerkUserAndIssueExchangeCode: async (input) => {
      calls.push({ input, operation: "attach" });
      return { exchangeCode: "exchange_code_synthetic" };
    },
    clerkPublishableKey: "pk_test_synthetic",
    currentUser: async () => ({
      emailAddresses: [{ emailAddress: "member@example.com" }],
      id: "user_rw_synthetic_member_001",
      primaryEmailAddress: null,
    }),
    getDesktopLoginAttemptByState: async (state) => {
      calls.push({ operation: "readAttempt", state });
      return {
        expiresAt: new Date(Date.now() + 60_000),
      };
    },
    syncClerkUserSupabaseProfile: async (input) => {
      calls.push({ input, operation: "syncProfile" });
      return { action: "upserted", ok: true, profile: {} };
    },
  });

  const response = await route.GET(
    createRequest("http://localhost:3000/desktop/handoff?state=rw_state"),
  );
  const location = new URL(response.headers.get("Location"));

  assert.equal(response.status, 302);
  assert.equal(location.protocol, "rubywhisper:");
  assert.equal(location.pathname, "/callback");
  assert.equal(location.searchParams.get("state"), "rw_state");
  assert.equal(location.searchParams.get("code"), "exchange_code_synthetic");
  assert.deepEqual(toPlainObject(calls), [
    { operation: "readAttempt", state: "rw_state" },
    {
      input: {
        clerkUserId: "user_rw_synthetic_member_001",
        primaryEmail: "member@example.com",
      },
      operation: "syncProfile",
    },
    {
      input: {
        clerkUserId: "user_rw_synthetic_member_001",
        state: "rw_state",
      },
      operation: "attach",
    },
  ]);
});

test("desktop handoff maps backend failures to a sanitized sign-in error", async () => {
  const route = await loadHandoffRouteModule({
    clerkPublishableKey: "pk_test_synthetic",
    currentUser: async () => ({
      emailAddresses: [],
      id: "user_rw_synthetic_member_001",
      primaryEmailAddress: null,
    }),
    getDesktopLoginAttemptByState: async () => {
      throw new Error("Database details must not leak.");
    },
  });

  const response = await route.GET(
    createRequest("http://localhost:3000/desktop/handoff?state=rw_state"),
  );
  const location = new URL(response.headers.get("Location"));

  assert.equal(response.status, 302);
  assert.equal(location.pathname, "/sign-in");
  assert.equal(location.searchParams.get("error"), "handoff_unavailable");
  assert.doesNotMatch(location.toString(), /Database details/);
});

async function loadHandoffRouteModule(overrides = {}) {
  const source = await readFile(handoffRoutePath, "utf8");
  const testableSource = source
    .replace(
      /import\s+\{\s+currentUser\s+\}\s+from\s+["']@clerk\/nextjs\/server["'];\n/,
      "const currentUser = mocks.currentUser;\n",
    )
    .replace(
      /import\s+\{\s+createClient\s+\}\s+from\s+["']@supabase\/supabase-js["'];\n/,
      "const createClient = mocks.createClient;\n",
    )
    .replace(
      /import\s+\{\s+NextResponse,\s+type NextRequest\s+\}\s+from\s+["']next\/server["'];\n\n/,
      "const NextResponse = mocks.NextResponse;\n\n",
    )
    .replace(
      /import\s+\{\s+serverEnv\s+\}\s+from\s+["']@\/config\/server["'];\n/,
      "const serverEnv = mocks.serverEnv;\n",
    )
    .replace(
      /import\s+\{\s+syncClerkUserSupabaseProfile\s+\}\s+from\s+["']@\/lib\/auth\/profile-sync["'];\n/,
      "const syncClerkUserSupabaseProfile = mocks.syncClerkUserSupabaseProfile;\n",
    )
    .replace(
      /import\s+\{\n\s+attachClerkUserAndIssueExchangeCode,\n\s+getDesktopLoginAttemptByState,\n\}\s+from\s+["']@\/lib\/desktop\/login-attempts["'];\n/,
      "const attachClerkUserAndIssueExchangeCode = mocks.attachClerkUserAndIssueExchangeCode;\nconst getDesktopLoginAttemptByState = mocks.getDesktopLoginAttemptByState;\n",
    )
    .replace(
      /import\s+type\s+\{\s+SupabaseServiceRoleRuntimeConfig\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: handoffRoutePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Date,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      mocks: createMocks(overrides),
    },
    {
      filename: handoffRoutePath,
    },
  );

  return commonJsModule.exports;
}

function createMocks(overrides) {
  return {
    attachClerkUserAndIssueExchangeCode:
      overrides.attachClerkUserAndIssueExchangeCode ??
      (() => {
        throw new Error("Unexpected exchange-code write.");
      }),
    createClient: () => {
      throw new Error("Live Supabase clients are outside handoff route tests.");
    },
    currentUser: overrides.currentUser ?? (() => null),
    getDesktopLoginAttemptByState:
      overrides.getDesktopLoginAttemptByState ??
      (() => {
        throw new Error("Unexpected login-attempt read.");
      }),
    NextResponse: {
      redirect(url, init = {}) {
        return new Response(null, {
          headers: { Location: String(url) },
          status: init.status ?? 302,
        });
      },
    },
    serverEnv: {
      client: {
        clerkPublishableKey: overrides.clerkPublishableKey,
      },
    },
    syncClerkUserSupabaseProfile:
      overrides.syncClerkUserSupabaseProfile ??
      (() => {
        throw new Error("Unexpected profile sync.");
      }),
  };
}

function createRequest(url) {
  return {
    nextUrl: new URL(url),
    url,
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
