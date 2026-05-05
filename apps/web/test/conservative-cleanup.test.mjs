import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const conservativeCleanupPath = path.join(
  webRoot,
  "src",
  "lib",
  "cleanup",
  "conservative-cleanup.ts",
);

test("conservative cleanup prompt preserves cleanup boundaries", async () => {
  const cleanup = await loadConservativeCleanupModule();
  const prompt = cleanup.createRubyWhisperConservativeCleanupPrompt({
    cleanupEnabled: true,
    context: "Synthetic editor context.",
    contextAwareCleanupEnabled: true,
    dictionaryTerms: [
      "term_placeholder_alpha",
      "term_placeholder_beta",
      "term_placeholder_alpha",
    ],
    transcriptText: "synthetic transcript content",
  });

  assert.equal(prompt.length, 2);
  assert.equal(prompt[0].role, "system");
  assert.match(prompt[0].content, /conservatively/i);
  assert.match(prompt[0].content, /Do not add new ideas/i);
  assert.equal(prompt[1].role, "user");
  assert.match(prompt[1].content, /Transcript:\nsynthetic transcript content/i);
  assert.match(
    prompt[1].content,
    /Known terms to preserve:\nterm_placeholder_alpha, term_placeholder_beta/,
  );
  assert.match(prompt[1].content, /Surrounding context:\nSynthetic editor context/);
  assert.match(prompt[1].content, /Return only the final cleaned transcript text/);
});

test("conservative cleanup builds provider input without disabled context", async () => {
  const cleanup = await loadConservativeCleanupModule();

  assert.deepEqual(
    cleanup.createRubyWhisperProviderCleanupInput({
      cleanupEnabled: false,
      transcriptText: "synthetic transcript",
    }),
    undefined,
  );

  assert.deepEqual(
    toPlainObject(
      cleanup.createRubyWhisperProviderCleanupInput({
        cleanupEnabled: true,
        context: "Synthetic context must be omitted.",
        contextAwareCleanupEnabled: false,
        dictionaryTerms: [
          " term_placeholder_alpha ",
          "",
          "term_placeholder_alpha",
        ],
        requestId: " req_rw_synthetic_cleanup_001 ",
        transcriptText: " synthetic transcript ",
      }),
    ),
    {
      cleanupEnabled: true,
      contextAwareCleanupEnabled: false,
      dictionaryTerms: ["term_placeholder_alpha"],
      requestId: "req_rw_synthetic_cleanup_001",
      transcriptText: "synthetic transcript",
    },
  );

  assert.deepEqual(
    toPlainObject(
      cleanup.createRubyWhisperProviderCleanupInput({
        cleanupEnabled: true,
        dictionaryTerms: ["", " ".repeat(2), "x".repeat(81)],
        transcriptText: "synthetic transcript",
      }),
    ),
    {
      cleanupEnabled: true,
      contextAwareCleanupEnabled: true,
      transcriptText: "synthetic transcript",
    },
  );
});

test("conservative cleanup calls provider transiently when enabled", async () => {
  const cleanup = await loadConservativeCleanupModule();
  const calls = [];
  const result = await cleanup.runRubyWhisperConservativeCleanup({
    cleanupEnabled: true,
    context: "Synthetic context.",
    contextAwareCleanupEnabled: true,
    dictionaryTerms: ["term_placeholder_alpha"],
    providerClient: {
      cleanup: async (input) => {
        calls.push(input);

        return {
          ok: true,
          result: {
            cleanedText: "Synthetic cleaned output.",
            provider: "mock_provider",
            providerLatencyMs: 18,
          },
        };
      },
    },
    requestId: "req_rw_synthetic_cleanup_001",
    transcriptText: "synthetic transcript content",
  });

  assert.deepEqual(toPlainObject(result), {
    cleanedText: "Synthetic cleaned output.",
    cleanupApplied: true,
    cleanupAttempted: true,
    fallbackUsed: false,
    provider: "mock_provider",
    providerLatencyMs: 18,
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      cleanupEnabled: true,
      context: "Synthetic context.",
      contextAwareCleanupEnabled: true,
      dictionaryTerms: ["term_placeholder_alpha"],
      requestId: "req_rw_synthetic_cleanup_001",
      transcriptText: "synthetic transcript content",
    },
  ]);
});

test("conservative cleanup returns original transcript and metadata when provider fails", async () => {
  const cleanup = await loadConservativeCleanupModule();
  let providerCalls = 0;
  const disabledResult = await cleanup.runRubyWhisperConservativeCleanup({
    cleanupEnabled: false,
    providerClient: {
      cleanup: async () => {
        providerCalls += 1;
        throw new Error("Provider cleanup must not run when disabled.");
      },
    },
    transcriptText: "synthetic transcript",
  });
  const fallbackResult = await cleanup.runRubyWhisperConservativeCleanup({
    cleanupEnabled: true,
    providerClient: {
      cleanup: async () => {
        providerCalls += 1;

        return {
          error: {
            apiErrorCode: "provider_error",
            code: "provider_unavailable",
            message: "Synthetic cleanup unavailable.",
            retryable: true,
          },
          metadata: {
            provider: "mock_provider",
            providerLatencyMs: 18,
          },
          ok: false,
        };
      },
    },
    transcriptText: "synthetic transcript",
  });
  const thrownFallbackResult = await cleanup.runRubyWhisperConservativeCleanup({
    cleanupEnabled: true,
    providerClient: {
      cleanup: async () => {
        providerCalls += 1;
        throw new Error("Synthetic thrown cleanup failure.");
      },
    },
    transcriptText: "synthetic transcript",
  });

  assert.deepEqual(toPlainObject(disabledResult), {
    cleanedText: "synthetic transcript",
    cleanupApplied: false,
    cleanupAttempted: false,
    fallbackUsed: false,
  });
  assert.deepEqual(toPlainObject(fallbackResult), {
    cleanedText: "synthetic transcript",
    cleanupApplied: false,
    cleanupAttempted: true,
    error: {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      message: "Synthetic cleanup unavailable.",
      retryable: true,
    },
    fallbackUsed: true,
    metadata: {
      provider: "mock_provider",
      providerLatencyMs: 18,
    },
  });
  assert.deepEqual(toPlainObject(thrownFallbackResult), {
    cleanedText: "synthetic transcript",
    cleanupApplied: false,
    cleanupAttempted: true,
    fallbackUsed: true,
  });
  assert.equal(providerCalls, 2);
});

test("conservative cleanup helper remains server-only and storage-free", async () => {
  const source = await readFile(conservativeCleanupPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /@supabase\/supabase-js|createSupabaseServiceRoleClient/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);
});

async function loadConservativeCleanupModule() {
  const source = await readFile(conservativeCleanupPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: conservativeCleanupPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: conservativeCleanupPath,
    },
  );

  return commonJsModule.exports;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
