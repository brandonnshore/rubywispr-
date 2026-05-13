import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const testRoot = path.join(webRoot, "test");
const nextStaticRoot = path.join(webRoot, ".next", "static");

const sourceFileExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const publicBundleExtensions = new Set([".css", ".html", ".js", ".map", ".mjs"]);
const clerkServerSecretNames = ["CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET"];
const supabaseServerEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const stripeServerSecretNames = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
const adminBootstrapEnvNames = ["RUBYWHISPER_ADMIN_BOOTSTRAP_EMAILS"];
const serverSecretNames = [
  ...clerkServerSecretNames,
  ...supabaseServerEnvNames,
  ...stripeServerSecretNames,
  ...adminBootstrapEnvNames,
  "GROQ_API_KEY",
  "DESKTOP_TOKEN_SECRET",
  "SENTRY_AUTH_TOKEN",
  "APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN",
];
const serverConfigHelpers = [
  {
    moduleSpecifier: "@/config/server",
    path: path.join(srcRoot, "config", "server.ts"),
  },
];
const serverAuthHelpers = [
  {
    moduleSpecifier: "@/lib/auth/clerk",
    path: path.join(srcRoot, "lib", "auth", "clerk.ts"),
  },
  {
    moduleSpecifier: "@/lib/auth/profile-sync",
    path: path.join(srcRoot, "lib", "auth", "profile-sync.ts"),
  },
  {
    moduleSpecifier: "@/lib/auth/terms-acceptance",
    path: path.join(srcRoot, "lib", "auth", "terms-acceptance.ts"),
  },
];
const serverAdminHelpers = [
  {
    moduleSpecifier: "@/lib/admin/api",
    path: path.join(srcRoot, "lib", "admin", "api.ts"),
  },
  {
    moduleSpecifier: "@/lib/admin/auth",
    path: path.join(srcRoot, "lib", "admin", "auth.ts"),
  },
  {
    moduleSpecifier: "@/lib/admin/bootstrap",
    path: path.join(srcRoot, "lib", "admin", "bootstrap.ts"),
  },
  {
    moduleSpecifier: "@/lib/admin/roles",
    path: path.join(srcRoot, "lib", "admin", "roles.ts"),
  },
];
const serverAccountHelpers = [
  {
    moduleSpecifier: "@/lib/account/desktop-account-snapshot",
    path: path.join(srcRoot, "lib", "account", "desktop-account-snapshot.ts"),
  },
  {
    moduleSpecifier: "@/lib/account/profile-metadata",
    path: path.join(srcRoot, "lib", "account", "profile-metadata.ts"),
  },
  {
    moduleSpecifier: "@/lib/account/subscription-cache",
    path: path.join(srcRoot, "lib", "account", "subscription-cache.ts"),
  },
  {
    moduleSpecifier: "@/lib/account/subscription-customer-metadata",
    path: path.join(
      srcRoot,
      "lib",
      "account",
      "subscription-customer-metadata.ts",
    ),
  },
];
const serverProviderHelpers = [
  {
    moduleSpecifier: "@/lib/providers/client",
    path: path.join(srcRoot, "lib", "providers", "client.ts"),
  },
  {
    moduleSpecifier: "@/lib/providers/groq",
    path: path.join(srcRoot, "lib", "providers", "groq.ts"),
  },
];
const serverBillingHelpers = [
  {
    moduleSpecifier: "@/lib/billing/stripe",
    path: path.join(srcRoot, "lib", "billing", "stripe.ts"),
  },
  {
    moduleSpecifier: "@/lib/billing/stripe-subscription-cache",
    path: path.join(srcRoot, "lib", "billing", "stripe-subscription-cache.ts"),
  },
  {
    moduleSpecifier: "@/lib/billing/stripe-webhook-idempotency",
    path: path.join(srcRoot, "lib", "billing", "stripe-webhook-idempotency.ts"),
  },
];
const serverSupabaseHelpers = [
  {
    moduleSpecifier: "@/lib/supabase/server",
    path: path.join(srcRoot, "lib", "supabase", "server.ts"),
  },
];
const serverBillingRoutes = [
  {
    moduleSpecifier: "@/app/api/stripe/checkout/route",
    path: path.join(srcRoot, "app", "api", "stripe", "checkout", "route.ts"),
  },
  {
    moduleSpecifier: "@/app/api/stripe/portal/route",
    path: path.join(srcRoot, "app", "api", "stripe", "portal", "route.ts"),
  },
  {
    moduleSpecifier: "@/app/api/stripe/webhook/route",
    path: path.join(srcRoot, "app", "api", "stripe", "webhook", "route.ts"),
  },
];
const serverDesktopTranscribeHelpers = [
  {
    moduleSpecifier: "@/lib/desktop-transcribe/request",
    path: path.join(srcRoot, "lib", "desktop-transcribe", "request.ts"),
  },
];
const serverRateLimitHelpers = [
  {
    moduleSpecifier: "@/lib/rate-limit/transcription",
    path: path.join(srcRoot, "lib", "rate-limit", "transcription.ts"),
  },
  {
    moduleSpecifier: "@/lib/rate-limit/supabase-transcription-rate-limits",
    path: path.join(
      srcRoot,
      "lib",
      "rate-limit",
      "supabase-transcription-rate-limits.ts",
    ),
  },
];
const serverUsageHelpers = [
  {
    moduleSpecifier: "@/lib/usage/fair-use",
    path: path.join(srcRoot, "lib", "usage", "fair-use.ts"),
  },
];
const serverOnlyHelpers = [
  ...serverAdminHelpers,
  ...serverAuthHelpers,
  ...serverAccountHelpers,
  ...serverDesktopTranscribeHelpers,
  ...serverRateLimitHelpers,
  ...serverUsageHelpers,
  ...serverProviderHelpers,
  ...serverBillingHelpers,
  ...serverBillingRoutes,
  ...serverSupabaseHelpers,
];
const browserForbiddenHelpers = [
  ...serverOnlyHelpers,
  ...serverConfigHelpers,
];
const adminSensitivePaths = [
  path.join(srcRoot, "app", "admin"),
  path.join(srcRoot, "app", "api", "admin"),
  path.join(srcRoot, "lib", "admin"),
];
const authSensitivePaths = [
  ...adminSensitivePaths,
  path.join(srcRoot, "app", "(auth)"),
  path.join(srcRoot, "app", "api", "account"),
  path.join(srcRoot, "app", "api", "desktop"),
  path.join(srcRoot, "app", "api", "stripe"),
  path.join(srcRoot, "config"),
  path.join(srcRoot, "lib", "account"),
  path.join(srcRoot, "lib", "auth"),
  path.join(srcRoot, "lib", "billing"),
  path.join(srcRoot, "lib", "desktop-transcribe"),
  path.join(srcRoot, "lib", "providers"),
  path.join(srcRoot, "lib", "rate-limit"),
  path.join(srcRoot, "lib", "usage"),
  path.join(srcRoot, "proxy.ts"),
];

const clientAuthorizationPatterns = [
  /\buseAuth\s*\(/,
  /\buseUser\s*\(/,
  /<\s*SignedIn\b/,
  /<\s*SignedOut\b/,
  /<\s*Protect\b/,
  /\bRedirectToSignIn\b/,
];

const privateAdminContentFieldPatterns = [
  {
    label: "raw transcript field",
    pattern:
      /\b(?:rawTranscript|raw_transcript|transcriptText|transcript_text|transcriptContent|transcript_content)\b/,
  },
  {
    label: "cleaned transcript field",
    pattern:
      /\b(?:cleanedText|cleaned_text|cleanedTranscript|cleaned_transcript)\b/,
  },
  {
    label: "Recent Wisprs local history field",
    pattern:
      /\b(?:finalText|final_text|recentWispr|recentWisprs|recent_wispr|recent_wisprs|localHistory|local_history|serverHistoryId|server_history_id)\b/,
  },
  {
    label: "audio content field",
    pattern:
      /\b(?:rawAudio|raw_audio|audio(?:Blob|Body|Buffer|Bytes|Content|Data|File|Input|Payload|Url|URL)|audio_(?:blob|body|buffer|bytes|content|data|file|input|payload))\b/,
  },
  {
    label: "clipboard content field",
    pattern:
      /\b(?:clipboardContent|clipboardText|clipboardValue|clipboard_content|clipboard_text|clipboard_value)\b/,
  },
  {
    label: "bare private content payload field",
    pattern: /(?:^|[,{]\s*)(?:audio|clipboard|transcript)\s*:/m,
  },
  {
    label: "private content select column",
    pattern:
      /\bselect\s*\(\s*["'`][^"'`]*\b(?:audio|clipboard|raw_transcript|recent_wisprs?|transcript)\b/i,
  },
  {
    label: "private provider or context field",
    pattern:
      /\b(?:appContext|app_context|dictionaryTerms|dictionary_terms|privateContent|private_content|providerRequestBody|provider_request_body|providerResponseBody|provider_response_body)\b/,
  },
];

const sensitiveLoggingPatterns = [
  /\bconsole\.(?:debug|error|info|log|warn)\s*\(/,
  /\b(?:logger|log)\.(?:debug|error|info|trace|warn)\s*\([^)]*\b(?:auth|jwt|link|magic|session|ticket|token)\b/ims,
  /\bJSON\.stringify\s*\([^)]*\b(?:auth|cookie|header|jwt|link|magic|session|ticket|token)\b[^)]*\)/ims,
];

const storedCredentialPatterns = [
  {
    label: "magic link or auth URL assignment",
    pattern:
      /\b(?:auth|clerk|magic|session|ticket)[_-]?(?:link|url)\b\s*[:=]\s*["'][^"']+["']/i,
  },
  {
    label: "session token or JWT assignment",
    pattern:
      /\b(?:auth|clerk|jwt|session|ticket|token)[_-]?(?:jwt|token|value)?\b\s*[:=]\s*["'][^"']{12,}["']/i,
  },
  {
    label: "query parameter token literal",
    pattern: /[?&](?:jwt|session|ticket|token)=/i,
  },
];

const nonSyntheticFixturePatterns = [
  {
    label: "JWT-like value",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    label: "Clerk secret or publishable key value",
    pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  },
  {
    label: "long Clerk session or ticket identifier",
    pattern: /\b(?:sess|ticket)_[A-Za-z0-9_-]{16,}\b/,
  },
  {
    label: "magic-link URL value",
    pattern:
      /https?:\/\/[^\s"'`]*(?:clerk|sign-in|sign-up|magic)[^\s"'`]*(?:ticket|token|session)=/i,
  },
];

test("server auth, admin, account, desktop, provider, Supabase, and Stripe billing surfaces remain server-only", async () => {
  for (const helper of serverOnlyHelpers) {
    const source = await readFile(helper.path, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, helper.path));

    assert.match(
      source,
      /^import\s+["']server-only["'];/m,
      `${relativePath} must be marked server-only`,
    );
    assert.doesNotMatch(
      source,
      /\bNEXT_PUBLIC_/,
      `${relativePath} must not read client-exposed env names`,
    );
  }
});

test("browser-bound source cannot import server auth/admin helpers or decide authorization", async () => {
  const violations = [];

  for (const filePath of await listFiles(srcRoot, sourceFileExtensions)) {
    const source = await readFile(filePath, "utf8");

    if (!isBrowserBoundSource(filePath, source)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(webRoot, filePath));
    const moduleSpecifiers = extractModuleSpecifiers(source);

    for (const helper of browserForbiddenHelpers) {
      if (moduleSpecifiers.some((specifier) => importsHelper(filePath, specifier, helper))) {
        violations.push(`${relativePath} imports ${helper.moduleSpecifier}`);
      }
    }

    for (const pattern of clientAuthorizationPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} contains client-only authorization logic`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("admin source exposes only metadata fields", async () => {
  const violations = [];

  for (const filePath of await listFiles(srcRoot, sourceFileExtensions)) {
    if (!isAdminSensitivePath(filePath)) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, filePath));

    for (const { label, pattern } of privateAdminContentFieldPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} contains ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("client source and public bundles do not expose server secrets", async (t) => {
  const violations = [];

  for (const filePath of await listFiles(srcRoot, sourceFileExtensions)) {
    const source = await readFile(filePath, "utf8");

    if (!isBrowserBoundSource(filePath, source)) {
      continue;
    }

    collectSecretNameViolations(violations, filePath, source);
  }

  const publicBundleFiles = await listFilesIfDirectory(
    nextStaticRoot,
    publicBundleExtensions,
  );

  if (publicBundleFiles.length === 0) {
    t.diagnostic(".next/static is absent; run npm run build before this test for public bundle coverage.");
  }

  for (const filePath of publicBundleFiles) {
    collectSecretNameViolations(violations, filePath, await readFile(filePath, "utf8"));
  }

  assert.deepEqual(violations, []);
});

test("auth-sensitive source does not log or store token and magic-link material", async () => {
  const violations = [];

  for (const filePath of await listFiles(srcRoot, sourceFileExtensions)) {
    if (!isAuthSensitivePath(filePath)) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, filePath));

    for (const pattern of sensitiveLoggingPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} contains auth-sensitive logging`);
      }
    }

    for (const { label, pattern } of storedCredentialPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} contains ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("auth test fixtures use only synthetic values", async () => {
  const violations = [];

  for (const filePath of await listFiles(testRoot, new Set([".mjs"]))) {
    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, filePath));

    for (const { label, pattern } of nonSyntheticFixturePatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativePath} contains ${label}`);
      }
    }

    for (const email of extractEmails(source)) {
      if (!isSyntheticEmail(email)) {
        violations.push(`${relativePath} contains non-placeholder email ${email}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function collectSecretNameViolations(violations, filePath, source) {
  const relativePath = normalizePath(path.relative(webRoot, filePath));

  for (const secretName of serverSecretNames) {
    if (new RegExp(`\\b${secretName}\\b`).test(source)) {
      violations.push(`${relativePath} exposes ${secretName}`);
    }
  }
}

async function listFiles(directory, allowedExtensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath, allowedExtensions);
      }

      if (entry.isFile() && allowedExtensions.has(path.extname(entry.name))) {
        return [entryPath];
      }

      return [];
    }),
  );

  return filePaths.flat();
}

async function listFilesIfDirectory(directory, allowedExtensions) {
  try {
    return await listFiles(directory, allowedExtensions);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isBrowserBoundSource(filePath, source) {
  const relativePath = normalizePath(path.relative(srcRoot, filePath));

  if (relativePath === "config/client.ts") {
    return true;
  }

  if (/^["']use client["'];/.test(source.trimStart())) {
    return true;
  }

  return extractModuleSpecifiers(source).some((specifier) =>
    ["@clerk/nextjs", "@clerk/react"].includes(specifier),
  );
}

function isAuthSensitivePath(filePath) {
  return authSensitivePaths.some((authPath) => {
    if (path.extname(authPath)) {
      return filePath === authPath;
    }

    return filePath.startsWith(`${authPath}${path.sep}`);
  });
}

function isAdminSensitivePath(filePath) {
  return adminSensitivePaths.some((adminPath) =>
    filePath.startsWith(`${adminPath}${path.sep}`),
  );
}

function extractModuleSpecifiers(source) {
  const moduleSpecifiers = [];
  const importExportRegex =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importExportRegex)) {
    moduleSpecifiers.push(match[1]);
  }

  for (const match of source.matchAll(dynamicImportRegex)) {
    moduleSpecifiers.push(match[1]);
  }

  return moduleSpecifiers;
}

function importsHelper(importerPath, moduleSpecifier, helper) {
  return (
    moduleSpecifier === helper.moduleSpecifier ||
    resolveModuleSpecifier(importerPath, moduleSpecifier) === helper.path
  );
}

function resolveModuleSpecifier(importerPath, moduleSpecifier) {
  if (moduleSpecifier.startsWith("@/")) {
    return resolveTypeScriptPath(path.join(srcRoot, moduleSpecifier.slice(2)));
  }

  if (moduleSpecifier.startsWith(".")) {
    return resolveTypeScriptPath(path.resolve(path.dirname(importerPath), moduleSpecifier));
  }

  return moduleSpecifier;
}

function resolveTypeScriptPath(filePath) {
  if (sourceFileExtensions.has(path.extname(filePath))) {
    return filePath;
  }

  return `${filePath}.ts`;
}

function extractEmails(source) {
  return [...source.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)].map(
    (match) => match[0],
  );
}

function isSyntheticEmail(email) {
  const domain = email.split("@").at(-1)?.toLowerCase();

  return Boolean(
    domain &&
      (domain === "example.com" ||
        domain.endsWith(".example") ||
        domain.endsWith(".invalid") ||
        domain.endsWith(".test")),
  );
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
