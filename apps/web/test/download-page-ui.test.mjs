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
const downloadPagePath = path.join(
  webRoot,
  "src",
  "app",
  "(public)",
  "download",
  "page.tsx",
);
const clientConfigPath = path.join(webRoot, "src", "config", "client.ts");
const envExampleFiles = [
  path.join(webRoot, ".env.example"),
  path.join(repoRoot, ".env.example"),
];

test("download page renders honest placeholder when no safe artifact URL exists", async () => {
  const pageModule = await loadDownloadPageModule();
  const markup = renderToStaticMarkup(pageModule.default());
  const source = await readFile(downloadPagePath, "utf8");

  assert.match(markup, /RubyWhisper for Mac beta\./);
  assert.match(markup, /The beta app download is not available yet\./);
  assert.match(markup, /local file paths, private URLs/);
  assert.match(markup, /href="\/account"/);
  assert.match(markup, /href="\/pricing"/);
  assert.match(markup, /href="mailto:/);
  assert.match(markup, /Email support/);
  assert.match(markup, /Mac-only for the v0\.1 beta/);
  assert.match(markup, /not stored on RubyWhisper servers/);
  assert.doesNotMatch(markup, /href="(?:file:|http:\/\/localhost|http:\/\/127\.0\.0\.1|\/Users\/)/);
  assert.doesNotMatch(markup, /Gatekeeper warnings|opens without/i);

  assert.match(source, /clientEnv\.latestAppDownloadUrl/);
  assert.doesNotMatch(source, /\/Users\/|\.env\.local|rubywhisper\.env/);
});

test("download page renders primary direct-download action for configured HTTPS URL", async () => {
  const latestAppDownloadUrl =
    "https://downloads.rubywhisper.example/RubyWhisper-beta.dmg";
  const pageModule = await loadDownloadPageModule({ latestAppDownloadUrl });
  const markup = renderToStaticMarkup(pageModule.default());

  assert.match(
    markup,
    /href="https:\/\/downloads\.rubywhisper\.example\/RubyWhisper-beta\.dmg"/,
  );
  assert.match(markup, /Download RubyWhisper Mac beta/);
  assert.match(markup, /Download the latest Mac beta/);
  assert.doesNotMatch(markup, /The beta app download is not available yet\./);
});

test("client download config accepts only blank or HTTPS public artifact URLs", async () => {
  const helper = await loadClientConfigModule({
    NEXT_PUBLIC_RUBYWHISPER_LATEST_APP_DOWNLOAD_URL:
      "https://downloads.rubywhisper.example/RubyWhisper.dmg",
  });

  assert.equal(
    helper.clientEnv.latestAppDownloadUrl,
    "https://downloads.rubywhisper.example/RubyWhisper.dmg",
  );
  assert.equal(helper.resolveSafePublicHttpsUrl(undefined), undefined);
  assert.equal(helper.resolveSafePublicHttpsUrl(""), undefined);
  assert.equal(helper.resolveSafePublicHttpsUrl("/Users/local/app.zip"), undefined);
  assert.equal(helper.resolveSafePublicHttpsUrl("file:///tmp/app.zip"), undefined);
  assert.equal(helper.resolveSafePublicHttpsUrl("http://127.0.0.1/app.zip"), undefined);
  assert.equal(
    helper.resolveSafePublicHttpsUrl(
      "https://downloads.rubywhisper.example/RubyWhisper.dmg",
    ),
    "https://downloads.rubywhisper.example/RubyWhisper.dmg",
  );
});

test("download URL env examples use blank public placeholders only", async () => {
  const publicDownloadName = "NEXT_PUBLIC_RUBYWHISPER_LATEST_APP_DOWNLOAD_URL";

  for (const filePath of envExampleFiles) {
    const source = await readFile(filePath, "utf8");
    const assignments = parseEnvAssignments(source);
    const relativePath = path.relative(repoRoot, filePath);

    assert.equal(assignments.get(publicDownloadName), "", relativePath);
    assert.doesNotMatch(source, /https?:\/\/|file:\/\/|\/Users\//, relativePath);
  }
});

async function loadDownloadPageModule({
  latestAppDownloadUrl = undefined,
} = {}) {
  const source = await readFile(downloadPagePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: downloadPagePath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    exports: commonJsModule.exports,
    module: commonJsModule,
    require: createDownloadPageRequire({ latestAppDownloadUrl }),
  };

  vm.runInNewContext(outputText, sandbox, { filename: downloadPagePath });

  return commonJsModule.exports;
}

function createDownloadPageRequire({ latestAppDownloadUrl }) {
  return function requireDownloadPageModule(specifier) {
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
      case "@/config/client":
        return {
          clientEnv: {
            latestAppDownloadUrl,
          },
        };
      default:
        throw new Error(`Unexpected download page dependency ${specifier}`);
    }
  };
}

async function loadClientConfigModule(env = {}) {
  const source = await readFile(clientConfigPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: clientConfigPath,
  });
  const commonJsModule = { exports: {} };
  const sandbox = {
    URL,
    exports: commonJsModule.exports,
    module: commonJsModule,
    process: {
      env,
    },
  };

  vm.runInNewContext(outputText, sandbox, { filename: clientConfigPath });

  return commonJsModule.exports;
}

function parseEnvAssignments(source) {
  const assignments = new Map();

  for (const line of source.split("\n")) {
    if (!/^[A-Z0-9_]+=/.test(line)) {
      continue;
    }

    const [name, value = ""] = line.split("=", 2);
    assignments.set(name, value);
  }

  return assignments;
}
