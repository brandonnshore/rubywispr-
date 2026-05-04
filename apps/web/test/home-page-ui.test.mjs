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
const publicPagePath = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "app",
  "(public)",
  "page.tsx",
);

const privateSentinels = [
  "PRIVATE_TRANSCRIPT_SENTINEL",
  "SYNTHETIC_AUDIO_BYTES",
  "LOCAL_CONTEXT_FIXTURE",
  "clipboard_secret_value",
  "dictionary_secret_value",
  "s3://private-rubywhisper-audio/member.m4a",
  "/Users/member/RubyWhisper/private.m4a",
  "cus_rw_should_not_render",
  "price_rw_should_not_render",
];

test("home page first viewport keeps RubyWhisper positioning and literal offer", async () => {
  const markup = await renderHomeMarkup();
  const heroMarkup = extractSectionBefore(markup, {
    start: 'aria-label="RubyWhisper overview"',
    end: 'id="works-heading"',
  });
  const heroText = textContent(heroMarkup);

  assert.match(heroText, /RubyWhisper/);
  assert.match(
    heroText,
    /Fast Mac dictation that works anywhere you can type\./,
  );
  assert.match(heroText, /Hold a hotkey, speak, and keep writing\./);
  assert.match(heroText, /native-feeling Mac utility/);
  assert.match(heroText, /quick dictation/);
});

test("home page keeps download, pricing, account, and auth routes discoverable", async () => {
  const markup = await renderHomeMarkup();

  assertRouteLinks(markup, [
    "/download",
    "/pricing",
    "/account",
    "/sign-up",
    "/sign-in",
  ]);
  assert.match(markup, /Check beta download/);
  assert.match(markup, /View pricing/);
  assert.match(markup, /Compare plans/);
  assert.match(markup, /href="mailto:brandon@rubyadvisory\.com"/);
});

test("home page keeps product proof and privacy promises without private storage claims", async () => {
  const markup = await renderHomeMarkup();
  const pageText = textContent(markup);

  assert.match(pageText, /Product proof/);
  assert.match(pageText, /Built around the recording island\./);
  assert.match(pageText, /listening, processing, success, or recovery/);
  assert.match(
    pageText,
    /The finished text appears where the cursor was already waiting\./,
  );

  assert.match(pageText, /Privacy promise/);
  assert.match(
    pageText,
    /Audio and transcript content are not stored on RubyWhisper servers\./,
  );
  assert.match(pageText, /Recent Wisprs live locally on the Mac/);
  assert.match(pageText, /support requests should not include private dictation text/);
  assertNoPrivateSentinels(pageText);
  assertNoServerSideAudioTranscriptStorageClaims(pageText);
});

async function renderHomeMarkup() {
  const pageModule = await loadPublicPageModule();
  return renderToStaticMarkup(pageModule.default());
}

async function loadPublicPageModule() {
  const source = await readFile(publicPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: publicPagePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createPublicPageRequire(),
  };

  vm.runInNewContext(outputText, sandbox, { filename: publicPagePath });

  return commonJsModule.exports;
}

function createPublicPageRequire() {
  return function requirePublicPageModule(specifier) {
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
        throw new Error(`Unexpected public page dependency ${specifier}`);
    }
  };
}

function extractSectionBefore(markup, { start, end }) {
  const startIndex = markup.indexOf(start);
  const endIndex = markup.indexOf(end);

  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  assert.ok(startIndex < endIndex, `${start} should appear before ${end}`);

  return markup.slice(startIndex, endIndex);
}

function textContent(markup) {
  return markup
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function assertNoServerSideAudioTranscriptStorageClaims(text) {
  const unsafeClaimPatterns = [
    /\bserver-side transcript storage\b/i,
    /\b(?:audio|transcript|transcripts|audio and transcript) content (?:is|are) stored on RubyWhisper servers\b/i,
    /\bRubyWhisper stores? (?:your )?(?:audio|transcript|transcripts|audio and transcript) (?:content )?(?:on|in) (?:its|RubyWhisper) servers\b/i,
    /\bwe store (?:your )?(?:audio|transcript|transcripts|audio and transcript) (?:content )?(?:server-side|on our servers)\b/i,
    /\bRubyWhisper servers keep (?:your )?(?:audio|transcript|transcripts|audio and transcript) content\b/i,
  ];

  for (const unsafeClaimPattern of unsafeClaimPatterns) {
    assert.doesNotMatch(text, unsafeClaimPattern);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
