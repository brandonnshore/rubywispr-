import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const desktopTranscribeRequestPath = path.join(
  webRoot,
  "src",
  "lib",
  "desktop-transcribe",
  "request.ts",
);
const syntheticOrigin = "https://rubywhisper-desktop.test";

test("desktop transcription parser accepts synthetic multipart requests", async () => {
  const parser = await loadDesktopTranscribeRequestModule();
  const formData = new FormData();
  const audio = new Blob([new Uint8Array([1, 2, 3, 4])], {
    type: "audio/wav",
  });

  formData.set("audio", audio, "synthetic.wav");
  formData.set("audioDurationMs", "4200");
  formData.set("appVersion", " 0.1.0-test ");
  formData.set("osVersion", " macOS synthetic ");
  formData.set("cleanupEnabled", "true");
  formData.set("contextAwareCleanupEnabled", "1");
  formData.set("context", " synthetic app context ");
  formData.set("dictionaryTerms", JSON.stringify(["RubyWhisper", "Unit API"]));

  const result = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: formData,
      method: "POST",
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(result.input.providerInput.audio instanceof Blob);
  assert.equal(result.input.providerInput.audio.size, audio.size);
  assert.equal(result.input.providerInput.audioDurationMs, 4200);
  assert.equal(result.input.providerInput.audioMimeType, "audio/wav");
  assert.deepEqual(result.input.metadata, {
    appVersion: "0.1.0-test",
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
    cleanupEnabled: true,
    contextAwareCleanupEnabled: true,
    osVersion: "macOS synthetic",
  });
  assert.deepEqual(result.input.cleanupSettings, {
    cleanupEnabled: true,
    context: "synthetic app context",
    contextAwareCleanupEnabled: true,
    dictionaryTerms: ["RubyWhisper", "Unit API"],
  });
});

test("desktop transcription parser accepts synthetic binary audio requests", async () => {
  const parser = await loadDesktopTranscribeRequestModule();
  const audioBytes = new Uint8Array([9, 8, 7]);
  const result = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: audioBytes,
      headers: {
        "content-type": "audio/webm; codecs=opus",
        "x-rubywhisper-app-version": "0.1.0-test",
        "x-rubywhisper-audio-duration-ms": "600000",
        "x-rubywhisper-cleanup-enabled": "yes",
        "x-rubywhisper-context-aware-cleanup-enabled": "false",
        "x-rubywhisper-os-version": "macOS synthetic",
      },
      method: "POST",
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(result.input.providerInput.audio instanceof ArrayBuffer);
  assert.equal(result.input.providerInput.audio.byteLength, audioBytes.byteLength);
  assert.deepEqual(result.input.metadata, {
    appVersion: "0.1.0-test",
    audioDurationMs: 600000,
    audioMimeType: "audio/webm",
    cleanupEnabled: true,
    contextAwareCleanupEnabled: false,
    osVersion: "macOS synthetic",
  });
});

test("desktop transcription parser rejects missing or unreadable audio before provider work", async () => {
  const parser = await loadDesktopTranscribeRequestModule();
  const noAudioForm = new FormData();
  const emptyAudioForm = new FormData();

  noAudioForm.set("audioDurationMs", "4200");
  emptyAudioForm.set(
    "audio",
    new Blob([], {
      type: "audio/wav",
    }),
    "empty.wav",
  );
  emptyAudioForm.set("audioDurationMs", "4200");

  const missingAudioResult = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: noAudioForm,
      method: "POST",
    }),
  );
  const emptyAudioResult = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: emptyAudioForm,
      method: "POST",
    }),
  );
  const unreadableBodyResult = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: "not a multipart body",
      headers: {
        "content-type": "multipart/form-data; boundary=synthetic",
      },
      method: "POST",
    }),
  );

  assert.deepEqual(missingAudioResult, { code: "invalid_audio", ok: false });
  assert.deepEqual(emptyAudioResult, { code: "invalid_audio", ok: false });
  assert.deepEqual(unreadableBodyResult, { code: "invalid_audio", ok: false });
});

test("desktop transcription parser rejects invalid duration and unsupported content type", async () => {
  const parser = await loadDesktopTranscribeRequestModule();
  const invalidDurationForm = new FormData();

  invalidDurationForm.set(
    "audio",
    new Blob([new Uint8Array([1])], {
      type: "audio/wav",
    }),
    "synthetic.wav",
  );
  invalidDurationForm.set("audioDurationMs", "4.2");

  const invalidDurationResult = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: invalidDurationForm,
      method: "POST",
    }),
  );
  const unsupportedContentTypeResult = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: JSON.stringify({ fixture: "synthetic" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );

  assert.deepEqual(invalidDurationResult, { code: "invalid_audio", ok: false });
  assert.deepEqual(unsupportedContentTypeResult, {
    code: "invalid_audio",
    ok: false,
  });
});

test("desktop transcription parser maps over-duration audio to duration limit metadata only", async () => {
  const parser = await loadDesktopTranscribeRequestModule();
  const formData = new FormData();

  formData.set(
    "audio",
    new Blob([new Uint8Array([1])], {
      type: "audio/wav",
    }),
    "synthetic.wav",
  );
  formData.set("audioDurationMs", "600001");
  formData.set("context", "payload must not echo");
  formData.set("dictionaryTerms", JSON.stringify(["payload must not echo"]));

  const result = await parser.parseDesktopTranscribeRequest(
    new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
      body: formData,
      method: "POST",
    }),
  );

  assert.deepEqual(result, {
    code: "duration_limit_reached",
    metadata: {
      audioDurationMs: 600001,
      durationLimitMs: 600000,
    },
    ok: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /payload must not echo/);
});

test("desktop transcription parser is server-only and privacy neutral", async () => {
  const source = await readFile(desktopTranscribeRequestPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /CLERK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|GROQ_API_KEY/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);
  assert.doesNotMatch(source, /from\s+["']next\/server["']/);
});

async function loadDesktopTranscribeRequestModule() {
  const source = await readFile(desktopTranscribeRequestPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: desktopTranscribeRequestPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}
