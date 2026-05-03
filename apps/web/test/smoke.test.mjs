import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

test("RubyWhisper web workspace exposes scaffold commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.name, "@rubywhisper/web");
  assert.equal(typeof packageJson.scripts.dev, "string");
  assert.equal(typeof packageJson.scripts.build, "string");
});

test("RubyWhisper route skeleton exposes public, account, admin, and API areas", async () => {
  await Promise.all([
    access("src/app/(public)/page.tsx"),
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
