import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

import { createSyntheticBackendRequest } from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const adminApiGuardPath = path.join(webRoot, "src", "lib", "admin", "api.ts");
const adminStatusRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "admin",
  "status",
  "route.ts",
);
const apiErrorsPath = path.join(webRoot, "src", "lib", "api", "errors.ts");
const privacyLoggerPath = path.join(
  webRoot,
  "src",
  "lib",
  "observability",
  "privacy-logger.ts",
);
const forbiddenPrivateAdminApiPattern =
  /private backend detail|rawTranscript|transcript|audio|providerRequestBody|user_rw_synthetic_member_001/i;

test("admin API guard allows signed-in active admins", async () => {
  const guardModule = await loadAdminApiGuardModule();
  const calls = [];

  const result = await guardModule.requireRubyWhisperAdminForApi({
    dependencies: {
      createClient: () => {
        calls.push({ operation: "createClient" });
        return {};
      },
      lookupAdminRole: async (input) => {
        calls.push({ clerkUserId: input.clerkUserId, operation: "lookup" });

        return createAllowedAdminResult(input.clerkUserId);
      },
      requireUserId: async () => ({
        ok: true,
        userId: "user_rw_synthetic_admin_001",
      }),
    },
    request: createSyntheticBackendRequest({
      method: "GET",
      path: "/api/admin/status",
    }),
    route: "/api/admin/status",
  });

  assert.deepEqual(toPlainObject(result), {
    action: "allowed",
    authorization: {
      action: "allowed",
      allowed: true,
      clerkUserId: "user_rw_synthetic_admin_001",
      ok: true,
      role: "admin",
      status: "active_admin",
    },
    ok: true,
  });
  assert.deepEqual(calls, [
    {
      clerkUserId: "user_rw_synthetic_admin_001",
      operation: "lookup",
    },
  ]);
});

test("admin API guard denies signed-out requests with the standard 401 shape", async () => {
  const guardModule = await loadAdminApiGuardModule();

  const result = await guardModule.requireRubyWhisperAdminForApi({
    dependencies: {
      lookupAdminRole: async () => {
        throw new Error("lookup should not run for signed-out requests");
      },
      requireUserId: async () => ({
        error: {
          code: "clerk_session_required",
          message: "A Clerk user session is required.",
        },
        ok: false,
      }),
    },
    request: createSyntheticBackendRequest({
      method: "GET",
      path: "/api/admin/status",
    }),
  });

  const body = await result.response.json();

  assert.equal(result.ok, false);
  assert.equal(result.status, "signed_out");
  assert.equal(result.response.status, 401);
  assert.equal(result.response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "signed_out",
      desktopState: "signed_out",
      message: "Sign in to use RubyWhisper.",
      recovery: "open_sign_in",
      retryable: false,
    },
  });
});

test("admin API guard denies signed-in non-admins without protected data", async () => {
  const guardModule = await loadAdminApiGuardModule();

  const result = await guardModule.requireRubyWhisperAdminForApi({
    dependencies: {
      lookupAdminRole: async (input) => ({
        action: "denied",
        allowed: false,
        clerkUserId: input.clerkUserId,
        error: {
          code: "supabase_admin_role_missing",
          message: "No active admin role metadata was found.",
        },
        ok: false,
        status: "missing_role",
      }),
      requireUserId: async () => ({
        ok: true,
        userId: "user_rw_synthetic_member_001",
      }),
    },
    request: createSyntheticBackendRequest({
      method: "GET",
      path: "/api/admin/status",
    }),
  });

  const body = await result.response.json();
  const serializedBody = JSON.stringify(body);

  assert.equal(result.ok, false);
  assert.equal(result.status, "forbidden");
  assert.equal(result.response.status, 403);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "admin_forbidden",
      desktopState: "blocked",
      message: "This account is not a RubyWhisper admin.",
      recovery: "open_account",
      retryable: false,
    },
  });
  assert.doesNotMatch(serializedBody, forbiddenPrivateAdminApiPattern);
});

test("admin API guard fails closed and logs safe metadata on backend errors", async () => {
  const guardModule = await loadAdminApiGuardModule();
  const logEvents = [];

  const result = await guardModule.requireRubyWhisperAdminForApi({
    dependencies: {
      lookupAdminRole: async () => {
        throw new Error("private backend detail");
      },
      recordFailureLog: (event) => {
        logEvents.push(event);
      },
      requireUserId: async () => ({
        ok: true,
        userId: "user_rw_synthetic_admin_001",
      }),
    },
    request: createSyntheticBackendRequest({
      method: "GET",
      path: "/api/admin/status",
    }),
    route: "/api/admin/status",
  });

  const body = await result.response.json();
  const serializedResult = JSON.stringify({
    body,
    logEvent: result.logEvent,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "read_failed");
  assert.equal(result.response.status, 503);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "service_unavailable",
      desktopState: "error",
      message: "RubyWhisper is temporarily unavailable.",
      recovery: "retry",
      retryable: true,
    },
  });
  assert.deepEqual(toPlainObject(logEvents), [
    {
      event: "backend.request.failed",
      metadata: {
        errorCode: "supabase_admin_role_read_failed",
        method: "GET",
        route: "/api/admin/status",
        status: "read_failed",
        userId: "user_rw_synthetic_admin_001",
      },
    },
  ]);
  assert.doesNotMatch(serializedResult, /private backend detail|rawTranscript|audio/i);
});

test("admin status API route is metadata-only and delegates every request to the guard", async () => {
  const guardCalls = [];
  const routeModule = await loadAdminStatusRouteModule({
    requireRubyWhisperAdminForApi: async (input) => {
      guardCalls.push({
        method: input.request.method,
        route: input.route,
        url: input.request.url,
      });

      return {
        action: "allowed",
        authorization: createAllowedAdminResult("user_rw_synthetic_admin_001"),
        ok: true,
      };
    },
  });

  const response = await routeModule.GET(
    createSyntheticBackendRequest({
      method: "GET",
      path: "/api/admin/status",
    }),
  );
  const body = await response.json();
  const serializedBody = JSON.stringify(body);

  assert.equal(routeModule.dynamic, "force-dynamic");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    service: "rubywhisper-web",
    status: "ok",
    surface: "admin-api",
    version: 1,
  });
  assert.deepEqual(guardCalls, [
    {
      method: "GET",
      route: "/api/admin/status",
      url: "https://rubywhisper-backend.test/api/admin/status",
    },
  ]);
  assert.ok(Buffer.byteLength(serializedBody, "utf8") <= 128);
  assert.doesNotMatch(serializedBody, forbiddenPrivateAdminApiPattern);
});

test("admin API guard and status route remain server-only route-handler code", async () => {
  const [guardSource, routeSource] = await Promise.all([
    readFile(adminApiGuardPath, "utf8"),
    readFile(adminStatusRoutePath, "utf8"),
  ]);

  assert.match(guardSource, /^import\s+["']server-only["'];/m);
  assert.match(guardSource, /requireClerkUserId/);
  assert.match(guardSource, /lookupRubyWhisperAdminRole/);
  assert.match(guardSource, /rubyWhisperApiErrorResponse/);
  assert.match(guardSource, /createRubyWhisperBackendRequestFailedLogEvent/);
  assert.doesNotMatch(guardSource, /^["']use client["'];/m);
  assert.doesNotMatch(guardSource, /\buseAuth\b|\buseUser\b|\bSignedIn\b|\bSignedOut\b|\bProtect\b/);

  assert.match(routeSource, /requireRubyWhisperAdminForApi/);
  assert.match(routeSource, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  assert.doesNotMatch(routeSource, /\buserId\b|\bclerkUserId\b|\baudio\b|\btranscript\b/);
});

async function loadAdminApiGuardModule() {
  const [apiErrors, privacyLogger] = await Promise.all([
    loadTypeScriptCommonJsModule(apiErrorsPath, createApiErrorsRequire()),
    loadTypeScriptCommonJsModule(privacyLoggerPath, createPrivacyLoggerRequire()),
  ]);

  return loadTypeScriptCommonJsModule(
    adminApiGuardPath,
    createAdminApiGuardRequire({ apiErrors, privacyLogger }),
  );
}

async function loadAdminStatusRouteModule(adminApiGuard) {
  return loadTypeScriptCommonJsModule(
    adminStatusRoutePath,
    createAdminStatusRouteRequire(adminApiGuard),
  );
}

async function loadTypeScriptCommonJsModule(filePath, requireModule) {
  const source = await readFile(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      Buffer,
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: requireModule,
    },
    {
      filename: filePath,
    },
  );

  return commonJsModule.exports;
}

function createApiErrorsRequire() {
  return function requireApiErrorsModule(specifier) {
    if (specifier === "server-only") {
      return {};
    }

    throw new Error(`Unexpected API errors dependency ${specifier}`);
  };
}

function createPrivacyLoggerRequire() {
  return function requirePrivacyLoggerModule(specifier) {
    if (specifier === "server-only") {
      return {};
    }

    throw new Error(`Unexpected privacy logger dependency ${specifier}`);
  };
}

function createAdminApiGuardRequire({ apiErrors, privacyLogger }) {
  return function requireAdminApiGuardModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient: () => ({}),
        };
      case "@/lib/admin/roles":
        return {
          lookupRubyWhisperAdminRole: async (input) =>
            createAllowedAdminResult(input.clerkUserId),
        };
      case "@/lib/api/errors":
        return apiErrors;
      case "@/lib/auth/clerk":
        return {
          requireClerkUserId: async () => ({
            ok: true,
            userId: "user_rw_synthetic_admin_001",
          }),
        };
      case "@/lib/observability/privacy-logger":
        return privacyLogger;
      default:
        throw new Error(`Unexpected admin API guard dependency ${specifier}`);
    }
  };
}

function createAdminStatusRouteRequire(adminApiGuard) {
  return function requireAdminStatusRouteModule(specifier) {
    switch (specifier) {
      case "@/lib/admin/api":
        return adminApiGuard;
      default:
        throw new Error(`Unexpected admin status route dependency ${specifier}`);
    }
  };
}

function createAllowedAdminResult(clerkUserId) {
  return {
    action: "allowed",
    allowed: true,
    clerkUserId,
    ok: true,
    role: "admin",
    status: "active_admin",
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
