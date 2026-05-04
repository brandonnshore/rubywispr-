import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const requireCommonJs = createRequire(import.meta.url);
const webRoot = path.join(repoRoot, "apps", "web");
const pricingPagePath = path.join(
  webRoot,
  "src",
  "app",
  "(public)",
  "pricing",
  "page.tsx",
);
const publicPagePath = path.join(
  webRoot,
  "src",
  "app",
  "(public)",
  "page.tsx",
);

test("public pricing page renders launch prices and fair-use trial copy", async () => {
  const pageModule = await loadPricingPageModule();
  const markup = renderToStaticMarkup(pageModule.default());
  const source = await readFile(pricingPagePath, "utf8");

  assert.match(markup, /One plan for Mac dictation\./);
  assert.match(markup, /\$7\/month billed monthly/);
  assert.match(markup, /\$60\/year as \$5\/month billed annually/);
  assert.match(markup, /5,000-word free trial/);
  assert.match(markup, /Provider costs included/);
  assert.match(markup, /Unlimited personal dictation under fair-use terms/);
  assert.match(markup, /not meeting transcription/);
  assert.match(markup, /Checkout opens through Stripe/);
  assert.match(markup, /existing account fallback flow/);

  assert.match(source, /startMonthlyCheckout/);
  assert.match(source, /startAnnualCheckout/);
  assert.match(source, /form action=\{plan\.action\}/);
  assert.match(source, /Start monthly checkout/);
  assert.match(source, /Start annual checkout/);
  assert.doesNotMatch(source, /promotion code|Friend of Ruby/i);
  assert.doesNotMatch(source, /\bprice_[A-Za-z0-9_]+\b/);
  assert.doesNotMatch(source, /\bSTRIPE_[A-Z0-9_]+\b/);
  assert.doesNotMatch(source, /\bsk_(?:live|test)_/);
});

test("public home links visitors to pricing", async () => {
  const source = await readFile(publicPagePath, "utf8");

  assert.match(source, /href:\s*["']\/pricing["']/);
  assert.match(source, /href:\s*["']\/download["']/);
  assert.match(source, /<Link href="\/download">Download<\/Link>/);
  assert.match(source, /<Link href="\/pricing">Pricing<\/Link>/);
  assert.match(source, /<Link href="\/sign-up">Sign up<\/Link>/);
  assert.match(source, /Check beta download/);
  assert.match(source, /View pricing/);
  assert.match(source, /Audio and transcript content are not stored/);
  assert.match(source, /mailto:\$\{supportEmail\}/);
});

async function loadPricingPageModule() {
  const source = await readFile(pricingPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pricingPagePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createPricingPageRequire(),
  };

  vm.runInNewContext(outputText, sandbox, { filename: pricingPagePath });

  return commonJsModule.exports;
}

function createPricingPageRequire() {
  return function requirePricingPageModule(specifier) {
    switch (specifier) {
      case "react/jsx-runtime":
        return requireCommonJs("react/jsx-runtime");
      case "next/link":
        return {
          default: ({ href, children, ...props }) =>
            requireCommonJs("react").createElement(
              "a",
              { ...props, href },
              children,
            ),
        };
      case "../../account/actions":
        return {
          startAnnualCheckout: async () => {},
          startMonthlyCheckout: async () => {},
        };
      default:
        throw new Error(`Unexpected pricing page dependency ${specifier}`);
    }
  };
}
