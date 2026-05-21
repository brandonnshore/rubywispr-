#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const defaultBaseUrl = "https://rubywhisper-web.vercel.app";
const defaultTimeoutMs = 15_000;
const minScreenshotBytes = 8_000;

const routes = [
  "/",
  "/pricing",
  "/download",
  "/privacy",
  "/terms",
  "/support",
  "/sign-in",
  "/sign-up",
];

const viewports = [
  { label: "desktop", width: 1365, height: 900 },
  { label: "mobile", width: 390, height: 844 },
];

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const helpText = `Usage: npm run qa:browser-smoke -- [options]

Source-safe deployed browser render smoke using local Chrome or Chromium.

Options:
  --base-url <url>       Public web deployment to smoke. Defaults to ${defaultBaseUrl}.
  --chrome-bin <path>    Chrome/Chromium binary. Defaults to CHROME_BIN or known system paths.
  --timeout-ms <number>  Per-screenshot timeout in milliseconds. Defaults to ${defaultTimeoutMs}.
  --output-dir <path>    Directory for screenshots. Defaults to a temporary directory.
  --keep-artifacts       Keep screenshots instead of deleting the temporary output directory.
  --help                 Show this help.

This script does not read .env.local or any private env source file. It renders
public pages only and records sanitized route, viewport, PNG dimensions, and
byte-size evidence.`;

class BrowserSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = "BrowserSmokeError";
  }
}

const parseArgs = (argv) => {
  const options = {
    baseUrl: defaultBaseUrl,
    chromeBin: undefined,
    keepArtifacts: false,
    outputDir: undefined,
    timeoutMs: defaultTimeoutMs,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url") {
      const value = argv[index + 1];
      if (!value) {
        throw new BrowserSmokeError("--base-url requires a URL value.");
      }
      options.baseUrl = value;
      index += 1;
      continue;
    }

    if (arg === "--chrome-bin") {
      const value = argv[index + 1];
      if (!value) {
        throw new BrowserSmokeError("--chrome-bin requires a path value.");
      }
      options.chromeBin = value;
      index += 1;
      continue;
    }

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--keep-artifacts") {
      options.keepArtifacts = true;
      continue;
    }

    if (arg === "--output-dir") {
      const value = argv[index + 1];
      if (!value) {
        throw new BrowserSmokeError("--output-dir requires a path value.");
      }
      options.outputDir = value;
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new BrowserSmokeError("--timeout-ms requires a positive integer.");
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }

    throw new BrowserSmokeError(`Unknown option: ${arg}`);
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
  } catch {
    throw new BrowserSmokeError(`Invalid --base-url: ${rawUrl}`);
  }
};

const fileExists = async (filePath) => {
  try {
    const result = await stat(filePath);
    return result.isFile();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }

    throw error;
  }
};

const findChromeBinary = async (explicitPath) => {
  const candidates = explicitPath ? [explicitPath] : chromeCandidates;

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new BrowserSmokeError(
    "Chrome/Chromium was not found. Set CHROME_BIN or pass --chrome-bin for browser smoke.",
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeRouteForFileName = (route) => {
  if (route === "/") {
    return "home";
  }

  return route
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
};

const routeUrl = (baseUrl, route) => new URL(route, `${baseUrl}/`).toString();

const fetchRoute = async (url) => {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  const failures = [];

  if (!response.ok) {
    failures.push(`HTTP ${response.status}`);
  }

  if (!contentType.includes("text/html")) {
    failures.push(`unexpected content-type ${contentType || "<missing>"}`);
  }

  if (!/RubyWhisper/i.test(body)) {
    failures.push("RubyWhisper content missing from HTML");
  }

  return failures;
};

const killProcessGroup = (child, signal = "SIGTERM") => {
  if (!child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The browser already exited.
    }
  }
};

const waitForExitAfterKill = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  killProcessGroup(child, "SIGTERM");
  await sleep(250);

  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  killProcessGroup(child, "SIGKILL");
};

const screenshotStats = async (screenshotPath) => {
  const bytes = await readFile(screenshotPath);

  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") {
    throw new BrowserSmokeError(`${screenshotPath} is not a PNG screenshot`);
  }

  return {
    byteLength: bytes.length,
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
};

const captureScreenshot = async ({
  chromeBin,
  outputDir,
  route,
  timeoutMs,
  url,
  viewport,
}) => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "rubywhisper-chrome-profile-"));
  const screenshotPath = path.join(
    outputDir,
    `${viewport.label}-${sanitizeRouteForFileName(route)}.png`,
  );
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-breakpad",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=5000",
    `--screenshot=${screenshotPath}`,
    url,
  ];
  const child = spawn(chromeBin, args, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderrChunks = [];
  let screenshotReady = false;

  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString("utf8"));
    if (stderrChunks.join("").length > 8_000) {
      stderrChunks.splice(0, stderrChunks.length - 1);
    }
  });

  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (await fileExists(screenshotPath)) {
        const result = await stat(screenshotPath);
        if (result.size >= minScreenshotBytes) {
          screenshotReady = true;
          break;
        }
      }

      if (child.exitCode !== null && !screenshotReady) {
        break;
      }

      await sleep(100);
    }

    if (!screenshotReady) {
      await waitForExitAfterKill(child);
      const stderr = stderrChunks.join("").trim();
      throw new BrowserSmokeError(
        `${viewport.label} ${route} did not produce a screenshot within ${timeoutMs}ms${
          stderr ? `; browser stderr: ${stderr}` : ""
        }`,
      );
    }

    const stats = await screenshotStats(screenshotPath);

    if (stats.width !== viewport.width || stats.height !== viewport.height) {
      throw new BrowserSmokeError(
        `${viewport.label} ${route} screenshot dimensions were ${stats.width}x${stats.height}, expected ${viewport.width}x${viewport.height}`,
      );
    }

    if (stats.byteLength < minScreenshotBytes) {
      throw new BrowserSmokeError(
        `${viewport.label} ${route} screenshot was too small (${stats.byteLength} bytes)`,
      );
    }

    await waitForExitAfterKill(child);

    return {
      ...stats,
      path: screenshotPath,
    };
  } finally {
    await rm(profileDir, { force: true, recursive: true });
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(helpText);
    return 0;
  }

  const chromeBin = await findChromeBinary(options.chromeBin);
  const outputDir =
    options.outputDir ?? (await mkdtemp(path.join(os.tmpdir(), "rubywhisper-browser-smoke-")));

  await mkdir(outputDir, { recursive: true });

  console.log("RubyWhisper deployed browser render smoke");
  console.log(`Base URL: ${options.baseUrl}`);
  console.log(`Chrome: ${chromeBin}`);
  console.log(`Output directory: ${outputDir}`);
  console.log("Private env files: not read by this script");

  try {
    for (const route of routes) {
      const url = routeUrl(options.baseUrl, route);
      const fetchFailures = await fetchRoute(url);

      if (fetchFailures.length > 0) {
        throw new BrowserSmokeError(`${route} fetch preflight failed: ${fetchFailures.join("; ")}`);
      }

      for (const viewport of viewports) {
        const screenshot = await captureScreenshot({
          chromeBin,
          outputDir,
          route,
          timeoutMs: options.timeoutMs,
          url,
          viewport,
        });

        console.log(
          `OK ${viewport.label} ${route} rendered ${screenshot.width}x${screenshot.height} PNG (${screenshot.byteLength} bytes)`,
        );
      }
    }

    console.log("OK deployed browser render smoke passed");
    return 0;
  } finally {
    if (!options.keepArtifacts && !options.outputDir) {
      await rm(outputDir, { force: true, recursive: true });
    }
  }
};

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = error instanceof BrowserSmokeError ? 1 : 1;
  });
