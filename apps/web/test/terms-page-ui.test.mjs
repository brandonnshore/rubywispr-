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
const termsPagePath = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "app",
  "(public)",
  "terms",
  "page.tsx",
);

const requiredRoutes = ["/privacy", "/support", "/account", "/pricing", "/download"];

const privateSentinels = [
  "PRIVATE_TRANSCRIPT_SENTINEL",
  "SYNTHETIC_AUDIO_BYTES",
  "LOCAL_CONTEXT_FIXTURE",
  "clipboard_secret_value",
  "dictionary_secret_value",
  "provider_request_payload",
];

test("terms page renders beta account, trial, and acceptance copy", async () => {
  const markup = await renderTermsMarkup();
  const text = textContent(markup);

  assert.match(text, /RubyWhisper beta terms\./);
  assert.match(text, /requires a signed-in account and Terms\/Privacy acceptance before trial dictation/);
  assert.match(text, /records acceptance timestamp metadata/);
  assert.match(text, /does not save the policy copy as the acceptance record/);
  assert.match(text, /5,000-word trial/);
  assert.match(text, /Paid plans are available/);
  assert.match(text, /Use RubyWhisper for personal dictation/);
  assert.match(text, /Do not depend on production availability/);
});

test("terms page links to legal, support, account, pricing, and download routes", async () => {
  const markup = await renderTermsMarkup();

  assertRouteLinks(markup, requiredRoutes);
  assert.match(markup, /Go to account acceptance/);
  assert.match(markup, /Read privacy details/);
  assert.match(markup, /Open support/);
  assert.match(markup, /View pricing/);
});

test("terms page keeps privacy-safe support and storage language", async () => {
  const markup = await renderTermsMarkup();
  const source = await readFile(termsPagePath, "utf8");
  const text = textContent(markup);

  assert.match(text, /server contract is metadata-only/);
  assert.match(text, /does not keep server-side audio, transcript, cleaned text, clipboard, prompt, provider payload, or local history content/);
  assert.match(text, /Do not include private dictation text, audio, transcripts, clipboard content, prompts, or provider request and response payloads/);
  assert.doesNotMatch(text, /please send|send us|send support/i);
  assert.doesNotMatch(source, /\.env\.local|rubywhisper\.env/);
  assertNoPrivateSentinels(text);
  assertNoUnsafeStorageClaims(text);
});

async function renderTermsMarkup() {
  const pageModule = await loadTermsPageModule();
  return renderToStaticMarkup(pageModule.default());
}

async function loadTermsPageModule() {
  const source = await readFile(termsPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: termsPagePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createTermsPageRequire(),
  };

  vm.runInNewContext(outputText, sandbox, { filename: termsPagePath });

  return commonJsModule.exports;
}

function createTermsPageRequire() {
  return function requireTermsPageModule(specifier) {
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
      default:
        throw new Error(`Unexpected terms page dependency ${specifier}`);
    }
  };
}

function assertRouteLinks(markup, expectedHrefs) {
  for (const href of expectedHrefs) {
    assert.match(markup, new RegExp(`href="${escapeRegex(href)}"`));
  }
}

function assertNoPrivateSentinels(text) {
  for (const sentinel of privateSentinels) {
    assert.doesNotMatch(text, new RegExp(escapeRegex(sentinel)));
  }
}

function assertNoUnsafeStorageClaims(text) {
  const unsafeClaimPatterns = [
    /\b(?:audio|transcript|transcripts|audio and transcript) content (?:is|are) stored on RubyWhisper servers\b/i,
    /\bRubyWhisper stores? (?:your )?(?:audio|transcript|transcripts|audio and transcript) (?:content )?(?:on|in) (?:its|RubyWhisper) servers\b/i,
    /\bwe store (?:your )?(?:audio|transcript|transcripts|audio and transcript) (?:content )?(?:server-side|on our servers)\b/i,
    /\bRubyWhisper servers keep (?:your )?(?:audio|transcript|transcripts|audio and transcript) content\b/i,
  ];

  for (const unsafeClaimPattern of unsafeClaimPatterns) {
    assert.doesNotMatch(text, unsafeClaimPattern);
  }
}

function textContent(markup) {
  return markup
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
