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
const supportPagePath = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "app",
  "(public)",
  "support",
  "page.tsx",
);

const requiredRoutes = ["/terms", "/privacy", "/account", "/download", "/pricing"];

const privateSentinels = [
  "PRIVATE_TRANSCRIPT_SENTINEL",
  "SYNTHETIC_AUDIO_BYTES",
  "LOCAL_CONTEXT_FIXTURE",
  "clipboard_secret_value",
  "dictionary_secret_value",
  "provider_request_payload",
];

test("support page renders beta support contact path", async () => {
  const markup = await renderSupportMarkup();
  const text = textContent(markup);

  assert.match(text, /RubyWhisper support\./);
  assert.match(text, /Email beta support for account, billing, download, plan, and app workflow questions/);
  assert.match(text, /Keep support requests metadata-only by default/);
  assert.match(markup, /href="mailto:/);
  assert.match(markup, /Email support/);
});

test("support page gives metadata-only troubleshooting guidance", async () => {
  const markup = await renderSupportMarkup();
  const text = textContent(markup);

  assert.match(text, /Metadata is usually enough/);
  assert.match(text, /account email, plan state, error code, request ID, app version, OS version, and rough workflow context/);
  assert.match(text, /Account email or the email you used to sign in/);
  assert.match(text, /Safe error code and request ID shown by the app or account surface/);
  assert.match(text, /RubyWhisper app version and macOS version/);
  assert.match(text, /rough workflow description/);
});

test("support page warns against private content by default", async () => {
  const markup = await renderSupportMarkup();
  const source = await readFile(supportPagePath, "utf8");
  const text = textContent(markup);

  assert.match(text, /Do not include private dictation by default/);
  assert.match(text, /Do not include dictation content, audio files, transcripts, clipboard contents, prompts, provider payloads, or screenshots with private text in support requests/);
  assert.match(text, /Private dictation text, raw transcripts, cleaned text, or local Recent Wisprs/);
  assert.match(text, /Audio files, recording contents, or exported audio/);
  assert.match(text, /Clipboard contents, surrounding app context, prompts, or personal dictionary terms/);
  assert.match(text, /Provider request payloads, provider response payloads, auth tokens, or secrets/);
  assert.match(text, /Screenshots that show private text/);
  assert.doesNotMatch(text, /please send|send us|send support/i);
  assert.doesNotMatch(source, /\.env\.local|rubywhisper\.env/);
  assertNoPrivateSentinels(text);
});

test("support page links legal, account, download, and pricing routes", async () => {
  const markup = await renderSupportMarkup();

  assertRouteLinks(markup, requiredRoutes);
  assert.match(markup, /Open account/);
  assert.match(markup, /Open download/);
});

async function renderSupportMarkup() {
  const pageModule = await loadSupportPageModule();
  return renderToStaticMarkup(pageModule.default());
}

async function loadSupportPageModule() {
  const source = await readFile(supportPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: supportPagePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createSupportPageRequire(),
  };

  vm.runInNewContext(outputText, sandbox, { filename: supportPagePath });

  return commonJsModule.exports;
}

function createSupportPageRequire() {
  return function requireSupportPageModule(specifier) {
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
        throw new Error(`Unexpected support page dependency ${specifier}`);
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

function textContent(markup) {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
