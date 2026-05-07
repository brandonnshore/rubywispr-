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
const sourceFileExtensions = new Set([".ts", ".tsx"]);
const clerkServerSecretNames = ["CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET"];
const clerkPublicName = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";

test("Clerk SDK foundation is installed without activating global client bundle wiring", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(webRoot, "package.json"), "utf8"),
  );
  const layout = await readFile(path.join(srcRoot, "app", "layout.tsx"), "utf8");

  assert.match(packageJson.dependencies["@clerk/nextjs"], /^\^?\d+\.\d+\.\d+/);
  assert.doesNotMatch(layout, /from\s+["']@clerk\/nextjs["']/);
  assert.doesNotMatch(layout, /<ClerkProvider\b/);
});

test("Clerk env config keeps secrets server-only and publishable key public", async () => {
  const clientConfig = await readFile(
    path.join(srcRoot, "config", "client.ts"),
    "utf8",
  );
  const serverConfig = await readFile(
    path.join(srcRoot, "config", "server.ts"),
    "utf8",
  );

  assert.match(clientConfig, new RegExp(`\\b${clerkPublicName}\\b`));
  assert.match(clientConfig, /\bclerkPublishableKey\b/);
  assert.match(clientConfig, /process\.env\.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.doesNotMatch(clientConfig, /process\.env\[[^\]]+\]/);

  const clientClerkNames = extractEnvNames(clientConfig).filter((name) =>
    name.includes("CLERK"),
  );
  assert.deepEqual(clientClerkNames, [clerkPublicName]);

  for (const secretName of clerkServerSecretNames) {
    assert.doesNotMatch(clientConfig, new RegExp(`\\b${secretName}\\b`));
    assert.match(serverConfig, new RegExp(`\\b${secretName}\\b`));
  }
});

test("Clerk placeholders expose only the publishable key as NEXT_PUBLIC", async () => {
  const envExampleFiles = [
    path.join(webRoot, ".env.example"),
    path.join(repoRoot, ".env.example"),
  ];

  for (const filePath of envExampleFiles) {
    const assignments = parseEnvAssignments(await readFile(filePath, "utf8"));
    const relativePath = path.relative(repoRoot, filePath);

    assert.equal(assignments.get("CLERK_SECRET_KEY"), "", relativePath);
    assert.equal(assignments.get("CLERK_WEBHOOK_SECRET"), "", relativePath);
    assert.equal(assignments.get(clerkPublicName), "", relativePath);

    const publicClerkNames = [...assignments.keys()].filter((name) =>
      /^NEXT_PUBLIC_.*CLERK/.test(name),
    );
    assert.deepEqual(publicClerkNames, [clerkPublicName], relativePath);
  }
});

test("client-facing source references Clerk browser SDK only from auth route shell", async () => {
  const violations = [];

  for (const filePath of await listSourceFiles(srcRoot)) {
    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(path.relative(webRoot, filePath));

    if (!isClientFacingSource(filePath, source)) {
      continue;
    }

    for (const secretName of clerkServerSecretNames) {
      if (new RegExp(`\\b${secretName}\\b`).test(source)) {
        violations.push(`${path.relative(webRoot, filePath)} references ${secretName}`);
      }
    }

    for (const moduleSpecifier of extractModuleSpecifiers(source)) {
      if (
        ["@clerk/nextjs", "@clerk/react"].includes(moduleSpecifier) &&
        !relativePath.startsWith("src/app/(auth)/")
      ) {
        violations.push(
          `${path.relative(webRoot, filePath)} imports ${moduleSpecifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

function extractEnvNames(source) {
  const envNames = [];
  const regex = /\b[A-Z][A-Z0-9_]*\b/g;

  for (const match of source.matchAll(regex)) {
    envNames.push(match[0]);
  }

  return [...new Set(envNames)];
}

function parseEnvAssignments(source) {
  const assignments = new Map();

  for (const line of source.split("\n")) {
    if (!/^[A-Z0-9_]+=/.test(line)) {
      continue;
    }

    const [name, value = ""] = line.split("=", 2);
    assignments.set(name, value);
  }

  return assignments;
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

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }

      if (entry.isFile() && sourceFileExtensions.has(path.extname(entry.name))) {
        return [entryPath];
      }

      return [];
    }),
  );

  return filePaths.flat();
}

function isClientFacingSource(filePath, source) {
  const relativePath = normalizePath(path.relative(srcRoot, filePath));

  if (relativePath === "config/client.ts") {
    return true;
  }

  if (/^["']use client["'];/.test(source.trimStart())) {
    return true;
  }

  return (
    relativePath.startsWith("app/") &&
    !relativePath.startsWith("app/api/") &&
    /(?:page|layout|loading|error|not-found)\.tsx?$/.test(relativePath)
  );
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
