#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const defaultBaseUrl = "https://rubywhisper-web.vercel.app";
const defaultTimeoutMs = 10_000;
const liveSmokeOptInEnv = "RUBYWHISPER_ALLOW_LIVE_RELEASE_SMOKES";

const sourceEnvFiles = [
  {
    label: "root env template",
    path: ".env.example",
  },
  {
    label: "web env template",
    path: "apps/web/.env.example",
  },
];

const requiredEnvNames = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "DESKTOP_TOKEN_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_MONTHLY_PRICE_ID",
  "STRIPE_ANNUAL_PRICE_ID",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "RUBYWHISPER_REALTIME_TRANSCRIPTION_ENABLED",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN",
  "NEXT_PUBLIC_RUBYWHISPER_APP_ENV",
  "NEXT_PUBLIC_RUBYWHISPER_APP_URL",
  "NEXT_PUBLIC_RUBYWHISPER_LATEST_APP_DOWNLOAD_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
];

const serverOnlyEnvNames = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "DESKTOP_TOKEN_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_MONTHLY_PRICE_ID",
  "STRIPE_ANNUAL_PRICE_ID",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN",
];

const publicRoutes = [
  "/",
  "/pricing",
  "/download",
  "/privacy",
  "/terms",
  "/support",
];

const deferredReleaseGates = [
  "Manual macOS QA from docs/qa/macos-manual-qa-harness.md",
  "Live Clerk magic-link, Terms, desktop token, and account smoke",
  "Live Supabase metadata-only writes, quota, admin, and privacy inspection",
  "Live Stripe checkout, portal, webhook, and Friend of Ruby promotion smoke",
  "Live OpenAI realtime and Groq fallback transcription smoke with synthetic audio",
  "Production privacy/log/crash reporting configuration and metadata-only review",
  "Apple Developer ID signing, notarization, stapling, checksum, hosted DMG/appcast, and clean-Mac QA",
];

const helpText = `Usage: npm run qa:release-gate -- [options]

Source-safe RubyWhisper beta release gate preflight.

Options:
  --base-url <url>       Public web deployment to smoke. Defaults to ${defaultBaseUrl}.
  --timeout-ms <number>  Per-request timeout in milliseconds. Defaults to ${defaultTimeoutMs}.
  --skip-network         Skip public HTTP smoke checks.
  --allow-blocked        Exit 0 when source-safe checks pass but live/manual gates remain deferred.
  --include-live         Also check that live-smoke env names are present in process.env.
                         Requires ${liveSmokeOptInEnv}=1 and still never prints values.
  --help                 Show this help.

This script does not read .env.local or any private env source file. If an
approved human wants --include-live to see process.env values, source the
private env in the current shell outside this script and keep values out of
logs.`;

class ReleaseGateError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseGateError";
  }
}

const parseArgs = (argv) => {
  const options = {
    allowBlocked: false,
    baseUrl: defaultBaseUrl,
    includeLive: false,
    skipNetwork: false,
    timeoutMs: defaultTimeoutMs,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--allow-blocked") {
      options.allowBlocked = true;
      continue;
    }

    if (arg === "--base-url") {
      const value = argv[index + 1];
      if (!value) {
        throw new ReleaseGateError("--base-url requires a URL value.");
      }
      options.baseUrl = value;
      index += 1;
      continue;
    }

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--include-live") {
      options.includeLive = true;
      continue;
    }

    if (arg === "--skip-network") {
      options.skipNetwork = true;
      continue;
    }

    if (arg === "--timeout-ms") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new ReleaseGateError("--timeout-ms requires a positive integer.");
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }

    throw new ReleaseGateError(`Unknown option: ${arg}`);
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);

  return options;
};

const normalizeBaseUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw new ReleaseGateError(`Invalid --base-url: ${rawUrl}`);
  }
};

const readEnvTemplateAssignments = async (envFilePath) => {
  const content = await readFile(envFilePath, "utf8");
  const assignments = new Map();
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (match) {
      assignments.set(match[1], {
        lineNumber: index + 1,
        value: match[2],
      });
    }
  });

  return assignments;
};

const checkEnvTemplates = async () => {
  const failures = [];

  for (const envFile of sourceEnvFiles) {
    const assignments = await readEnvTemplateAssignments(envFile.path);

    for (const requiredName of requiredEnvNames) {
      if (!assignments.has(requiredName)) {
        failures.push(`${envFile.label} is missing ${requiredName}`);
      }
    }

    for (const [name, assignment] of assignments) {
      if (assignment.value.trim() !== "") {
        failures.push(
          `${envFile.label} has non-blank placeholder ${name} on line ${assignment.lineNumber}`,
        );
      }
    }

    for (const serverOnlyName of serverOnlyEnvNames) {
      if (serverOnlyName.startsWith("NEXT_PUBLIC_")) {
        failures.push(`${serverOnlyName} is listed as server-only but is public`);
      }
    }
  }

  return failures;
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const smokePublicHtmlRoute = async ({ baseUrl, route, timeoutMs }) => {
  const response = await fetchWithTimeout(`${baseUrl}${route}`, timeoutMs);
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  const failures = [];

  if (!response.ok) {
    failures.push(`${route} returned HTTP ${response.status}`);
  }

  if (!contentType.includes("text/html")) {
    failures.push(`${route} returned unexpected content-type ${contentType || "<missing>"}`);
  }

  if (!/RubyWhisper/i.test(body)) {
    failures.push(`${route} response did not include RubyWhisper content`);
  }

  return failures;
};

const smokeStatusRoute = async ({ baseUrl, timeoutMs }) => {
  const response = await fetchWithTimeout(`${baseUrl}/api/status`, timeoutMs);
  const contentType = response.headers.get("content-type") ?? "";
  const cacheControl = response.headers.get("cache-control") ?? "";
  const failures = [];

  if (response.status !== 200) {
    failures.push(`/api/status returned HTTP ${response.status}`);
  }

  if (!contentType.includes("application/json")) {
    failures.push(`/api/status returned unexpected content-type ${contentType || "<missing>"}`);
  }

  if (!cacheControl.toLowerCase().includes("no-store")) {
    failures.push("/api/status did not include Cache-Control: no-store");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    failures.push("/api/status did not return valid JSON");
    return failures;
  }

  const expectedFields = {
    service: "rubywhisper-web",
    status: "ok",
    surface: "api",
    version: 1,
  };

  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    if (payload?.[key] !== expectedValue) {
      failures.push(
        `/api/status field ${key} was ${JSON.stringify(payload?.[key])}, expected ${JSON.stringify(
          expectedValue,
        )}`,
      );
    }
  }

  return failures;
};

const checkPublicNetwork = async (options) => {
  const failures = [];

  for (const route of publicRoutes) {
    failures.push(
      ...(await smokePublicHtmlRoute({
        baseUrl: options.baseUrl,
        route,
        timeoutMs: options.timeoutMs,
      })),
    );
  }

  failures.push(
    ...(await smokeStatusRoute({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    })),
  );

  return failures;
};

const liveEnvPresenceNames = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "DESKTOP_TOKEN_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_MONTHLY_PRICE_ID",
  "STRIPE_ANNUAL_PRICE_ID",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_RUBYWHISPER_APP_URL",
];

const checkLiveEnvPresence = () => {
  if (process.env[liveSmokeOptInEnv] !== "1") {
    return [
      `--include-live requires ${liveSmokeOptInEnv}=1 so live-smoke env checks are explicit.`,
    ];
  }

  const missing = liveEnvPresenceNames.filter((name) => !process.env[name]?.trim());
  return missing.map((name) => `process.env is missing ${name} for live release smoke setup`);
};

const printResultList = (label, items) => {
  for (const item of items) {
    console.log(`${label} ${item}`);
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(helpText);
    return 0;
  }

  console.log("RubyWhisper release gate preflight");
  console.log(`Base URL: ${options.baseUrl}`);
  console.log("Private env files: not read by this script");

  const failures = [];
  const deferred = [...deferredReleaseGates];

  const envTemplateFailures = await checkEnvTemplates();
  if (envTemplateFailures.length === 0) {
    console.log("OK env templates include blank release gate placeholders");
  } else {
    failures.push(...envTemplateFailures);
  }

  if (options.skipNetwork) {
    console.log("OK public deployment smoke skipped by --skip-network");
  } else {
    try {
      const networkFailures = await checkPublicNetwork(options);
      if (networkFailures.length === 0) {
        console.log("OK public deployment smoke passed");
      } else {
        failures.push(...networkFailures);
      }
    } catch (error) {
      failures.push(`public deployment smoke failed: ${error.message}`);
    }
  }

  if (options.includeLive) {
    const liveEnvFailures = checkLiveEnvPresence();
    if (liveEnvFailures.length === 0) {
      console.log("OK live-smoke env names are present in process.env; values were not printed");
    } else {
      failures.push(...liveEnvFailures);
    }
  }

  printResultList("DEFERRED", deferred);

  if (failures.length > 0) {
    printResultList("FAIL", failures);
    return 1;
  }

  if (deferred.length > 0 && !options.allowBlocked) {
    console.error(
      "Release remains blocked: source-safe checks passed, but live/manual release gates are still deferred. Re-run with --allow-blocked only when recording source-safe evidence.",
    );
    return 2;
  }

  console.log("OK source-safe release gate preflight passed");
  return 0;
};

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
