import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("RubyWhisper web workspace exposes scaffold commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.name, "@rubywhisper/web");
  assert.equal(typeof packageJson.scripts.dev, "string");
  assert.equal(typeof packageJson.scripts.build, "string");
});
