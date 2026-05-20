#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const endpoint = "https://api.groq.com/openai/v1/audio/transcriptions";
const model = "whisper-large-v3-turbo";
const pricePerHourUsd = 0.04;
const minimumBillingSeconds = 10;

const samples = [
  {
    bucket: "short",
    repeats: 1,
  },
  {
    bucket: "medium",
    repeats: 4,
  },
  {
    bucket: "longer",
    repeats: 12,
  },
];

const syntheticSentence =
  "RubyWhisper benchmark sample. Synthetic speech only. Alpha zero one two.";

main().catch((error) => {
  const code = normalizeErrorCode(error);

  console.error(`benchmark_failed ${code}`);
  process.exitCode = 1;
});

async function main() {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("missing_groq_api_key");
  }

  await requireCommand("say");
  await requireCommand("afconvert");
  await requireCommand("afinfo");

  console.log("RubyWhisper Groq benchmark");
  console.log(`model=${model}`);
  console.log("audio=temporary synthetic speech generated with macOS say");
  console.log("privacy=transcripts, provider payloads, audio files, and env values omitted");
  console.log("");
  console.log(
    "bucket,audio_seconds,billed_seconds,latency_ms,status,estimated_transcription_cost_usd",
  );

  for (const sample of samples) {
    const result = await benchmarkSample(sample, apiKey);

    console.log(
      [
        result.bucket,
        formatSeconds(result.audioSeconds),
        formatSeconds(result.billedSeconds),
        Math.round(result.latencyMs),
        result.status,
        result.estimatedCostUsd.toFixed(6),
      ].join(","),
    );
  }
}

async function benchmarkSample(sample, apiKey) {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "rubywhisper-groq-"));

  try {
    const aiffPath = path.join(tempDirectory, `${sample.bucket}.aiff`);
    const wavPath = path.join(tempDirectory, `${sample.bucket}.wav`);
    const text = Array.from({ length: sample.repeats }, () => syntheticSentence).join(
      " ",
    );

    await execFileAsync("say", ["-v", "Samantha", "-o", aiffPath, text]);
    await execFileAsync("afconvert", [
      "-f",
      "WAVE",
      "-d",
      "LEI16@16000",
      aiffPath,
      wavPath,
    ]);

    const audioSeconds = await readAudioDurationSeconds(wavPath);
    const audio = await readFile(wavPath);
    const formData = new FormData();

    formData.set("file", new Blob([audio], { type: "audio/wav" }), "synthetic.wav");
    formData.set("model", model);
    formData.set("response_format", "json");
    formData.set("language", "en");

    const startedAt = performance.now();
    const response = await fetch(endpoint, {
      body: formData,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
    });
    const latencyMs = performance.now() - startedAt;
    const status = await normalizedStatus(response);
    const billedSeconds = Math.max(minimumBillingSeconds, audioSeconds);

    return {
      audioSeconds,
      billedSeconds,
      bucket: sample.bucket,
      estimatedCostUsd: (billedSeconds / 3600) * pricePerHourUsd,
      latencyMs,
      status,
    };
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

async function normalizedStatus(response) {
  if (!response.ok) {
    return providerErrorCodeForStatus(response.status);
  }

  const payload = await response.json();

  return typeof payload?.text === "string" && payload.text.trim()
    ? "ok"
    : "provider_invalid_response";
}

async function readAudioDurationSeconds(filePath) {
  const { stdout } = await execFileAsync("afinfo", [filePath], {
    maxBuffer: 1024 * 1024,
  });
  const match = stdout.match(/estimated duration:\s+([0-9.]+)\s+sec/i);

  if (!match) {
    throw new Error("audio_duration_unavailable");
  }

  return Number.parseFloat(match[1]);
}

async function requireCommand(command) {
  try {
    await execFileAsync("command", ["-v", command], { shell: true });
  } catch {
    throw new Error(`missing_command_${command}`);
  }
}

function providerErrorCodeForStatus(status) {
  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 408 || status === 504) {
    return "provider_timeout";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return "invalid_request";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "unknown_provider_error";
}

function normalizeErrorCode(error) {
  if (!(error instanceof Error)) {
    return "unknown_error";
  }

  if (/missing_groq_api_key/.test(error.message)) {
    return "missing_config";
  }

  if (/missing_command_/.test(error.message)) {
    return error.message;
  }

  return "unknown_error";
}

function formatSeconds(value) {
  return value.toFixed(2);
}
