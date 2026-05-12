import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const diagRoutePath = path.join("src", "app", "api", "diag", "route.ts");

test("diagnostic route reports only presence metadata without secret derivatives", async () => {
  const source = await readFile(diagRoutePath, "utf8");

  assert.match(source, /state:\s*["']present["']/);
  assert.match(source, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(source, /\bprefix\b/);
  assert.doesNotMatch(source, /\.slice\s*\(/);
  assert.doesNotMatch(source, /\.length\b/);
});
