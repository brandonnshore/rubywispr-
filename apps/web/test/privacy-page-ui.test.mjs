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
const privacyPagePath = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "app",
  "(public)",
  "privacy",
  "page.tsx",
);

const requiredRoutes = ["/terms", "/support", "/account", "/pricing", "/download"];

const privateSentinels = [
  "PRIVATE_TRANSCRIPT_SENTINEL",
  "SYNTHETIC_AUDIO_BYTES",
  "LOCAL_CONTEXT_FIXTURE",
  "clipboard_secret_value",
  "dictionary_secret_value",
  "provider_request_payload",
];

test("privacy page renders metadata-only architecture copy", async () => {
  const markup = await renderPrivacyMarkup();
  const text = textContent(markup);

  assert.match(text, /RubyWhisper privacy\./);
  assert.match(text, /transient dictation processing and metadata-only account records/);
  assert.match(text, /RubyWhisper servers do not store audio, raw transcripts, cleaned text, clipboard content, app context, prompts, provider payloads, or local Recent Wisprs/);
  assert.match(text, /The server contract is metadata-only for account, usage, request, billing, support, and admin operations/);
  assert.match(text, /Audio and text pass through only to complete a request/);
  assert.match(text, /does not persist the audio, transcript, cleanup prompt, provider payload, or final text as a server record/);
});

test("privacy page explains local Recent Wisprs and persisted metadata", async () => {
  const markup = await renderPrivacyMarkup();
  const text = textContent(markup);

  assert.match(text, /Recent Wisprs stay on your Mac/);
  assert.match(text, /expire after 7 days by default/);
  assert.match(text, /do not upload, display, or store local Recent Wisprs/);
  assert.match(text, /account identity, Terms\/Privacy acceptance, plan state, aggregate usage counters, billing cache state/);
  assert.match(text, /provider names, duration, word counts, latency, status, and safe error codes/);
  assert.match(text, /Word counts are aggregate usage metadata/);
  assert.match(text, /Stripe billing metadata and cache state/);
});

test("privacy page links legal, support, account, pricing, and download routes", async () => {
  const markup = await renderPrivacyMarkup();

  assertRouteLinks(markup, requiredRoutes);
  assert.match(markup, /Read beta terms/);
  assert.match(markup, /Open account/);
  assert.match(markup, /Email support/);
});

test("privacy page keeps support and admin copy privacy-safe", async () => {
  const markup = await renderPrivacyMarkup();
  const source = await readFile(privacyPagePath, "utf8");
  const text = textContent(markup);

  assert.match(text, /Support and admin operations should never see transcript, audio, clipboard, prompt, app context, dictionary, provider request, provider response, or Recent Wisprs content/);
  assert.match(text, /Do not include private dictation content in support email/);
  assert.doesNotMatch(text, /please send|send us|send support/i);
  assert.doesNotMatch(source, /\.env\.local|rubywhisper\.env/);
  assertNoPrivateSentinels(text);
  assertNoUnsafeStorageClaims(text);
});

async function renderPrivacyMarkup() {
  const pageModule = await loadPrivacyPageModule();
  return renderToStaticMarkup(pageModule.default());
}

async function loadPrivacyPageModule() {
  const source = await readFile(privacyPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: privacyPagePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createPrivacyPageRequire(),
  };

  vm.runInNewContext(outputText, sandbox, { filename: privacyPagePath });

  return commonJsModule.exports;
}

function createPrivacyPageRequire() {
  return function requirePrivacyPageModule(specifier) {
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
        throw new Error(`Unexpected privacy page dependency ${specifier}`);
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
