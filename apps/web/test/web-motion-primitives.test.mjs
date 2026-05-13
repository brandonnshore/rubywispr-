import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const globalsPath = path.join(webRoot, "src", "app", "globals.css");
const homePagePath = path.join(webRoot, "src", "app", "(public)", "page.tsx");
const pricingPagePath = path.join(
  webRoot,
  "src",
  "app",
  "(public)",
  "pricing",
  "page.tsx",
);

test("M4.4 web motion primitives use tokenized CSS with reduced-motion guards", async () => {
  const css = await readFile(globalsPath, "utf8");

  assert.match(css, /\.rw-reveal\b/);
  assert.match(css, /\.rw-scroll-reveal\b/);
  assert.match(css, /@keyframes rw-reveal-in/);
  assert.match(css, /transform:\s*translateY\(8px\)/);
  assert.match(css, /animation-timeline:\s*view\(\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.rw-button:hover[\s\S]*scale\(1\.02\)/);
  assert.match(css, /\.route-link:hover[\s\S]*scale\(1\.02\)/);
  assert.doesNotMatch(css, /framer-motion|motion\/react/i);
});

test("public marketing and pricing routes opt into reveal primitives", async () => {
  const [homeSource, pricingSource] = await Promise.all([
    readFile(homePagePath, "utf8"),
    readFile(pricingPagePath, "utf8"),
  ]);

  assert.match(homeSource, /marketing-home-panel rw-reveal/);
  assert.match(homeSource, /product-proof rw-reveal/);
  assert.match(homeSource, /marketing-section rw-scroll-reveal/);
  assert.match(homeSource, /marketing-pricing rw-scroll-reveal/);

  assert.match(pricingSource, /pricing-panel rw-reveal/);
  assert.match(pricingSource, /pricing-hero rw-reveal/);
  assert.match(pricingSource, /pricing-card rw-panel rw-scroll-reveal/);
  assert.match(pricingSource, /pricing-included rw-scroll-reveal/);
});
