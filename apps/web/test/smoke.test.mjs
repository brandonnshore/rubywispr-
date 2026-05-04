import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

test("RubyWhisper web workspace exposes scaffold commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.name, "@rubywhisper/web");
  assert.equal(typeof packageJson.scripts.dev, "string");
  assert.equal(typeof packageJson.scripts.build, "string");
});

test("typecheck ignores stale Next dev server metadata", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const typecheckConfig = JSON.parse(
    await readFile("tsconfig.typecheck.json", "utf8"),
  );

  assert.match(packageJson.scripts.typecheck, /tsconfig\.typecheck\.json/);
  assert.deepEqual(typecheckConfig.exclude, ["node_modules", ".next/dev"]);
});

test("RubyWhisper route skeleton exposes public, auth, account, admin, and API areas", async () => {
  await Promise.all([
    access("src/app/(public)/page.tsx"),
    access("src/app/(auth)/sign-in/[[...sign-in]]/page.tsx"),
    access("src/app/(auth)/sign-up/[[...sign-up]]/page.tsx"),
    access("src/app/account/page.tsx"),
    access("src/app/admin/page.tsx"),
    access("src/app/api/status/route.ts"),
  ]);
});

test("API status placeholder is deterministic and non-sensitive", async () => {
  const statusRoute = await readFile("src/app/api/status/route.ts", "utf8");

  assert.match(statusRoute, /service: "rubywhisper-web"/);
  assert.match(statusRoute, /status: "ok"/);
  assert.match(statusRoute, /surface: "api"/);
  assert.doesNotMatch(statusRoute, /process\.env|Date|crypto|Math\.random/);
});

test("environment examples are blank placeholders only", async () => {
  const envExamplePaths = [".env.example", "../../.env.example"];

  for (const envExamplePath of envExamplePaths) {
    const envExample = await readFile(envExamplePath, "utf8");
    const assignments = envExample
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line));

    assert.ok(assignments.length > 0, `${envExamplePath} has env names`);

    for (const assignment of assignments) {
      const [, value] = assignment.split("=", 2);
      assert.equal(value, "", `${envExamplePath} keeps ${assignment} blank`);
    }
  }
});

test("client config exposes only NEXT_PUBLIC variables", async () => {
  const clientConfig = await readFile("src/config/client.ts", "utf8");
  const serverConfig = await readFile("src/config/server.ts", "utf8");
  const serverOnlyNames = [
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_MONTHLY_PRICE_ID",
    "STRIPE_ANNUAL_PRICE_ID",
    "GROQ_API_KEY",
    "SENTRY_DSN",
    "SENTRY_AUTH_TOKEN",
    "APP_DOWNLOAD_SIGNING_KEY_OR_TOKEN",
  ];

  assert.match(clientConfig, /NEXT_PUBLIC_/);

  for (const name of serverOnlyNames) {
    assert.doesNotMatch(clientConfig, new RegExp(`\\b${name}\\b`));
    assert.match(serverConfig, new RegExp(`\\b${name}\\b`));
  }
});
