import "server-only";

import type {
  RubyWhisperProviderCleanupInput,
  RubyWhisperProviderClient,
  RubyWhisperProviderName,
} from "@/lib/providers/client";

export const rubyWhisperConservativeCleanupSystemPrompt = [
  "You clean dictated text conservatively for RubyWhisper.",
  "Add punctuation and capitalization where clear.",
  "Remove only obvious filler words.",
  "Fix only obvious transcription mistakes.",
  "Preserve names, jargon, product terms, intent, and tone.",
  "Do not add new ideas, facts, summaries, or formatting.",
  "Return only the cleaned transcript text.",
].join(" ");

export type RubyWhisperCleanupPromptMessage = Readonly<{
  content: string;
  role: "system" | "user";
}>;

export type RubyWhisperConservativeCleanupInput = Readonly<{
  cleanupEnabled: boolean;
  providerClient: Pick<RubyWhisperProviderClient, "cleanup">;
  transcriptText?: string | null;
  context?: string | null;
  contextAwareCleanupEnabled?: boolean;
  dictionaryTerms?: readonly string[] | null;
  requestId?: string | null;
}>;

export type RubyWhisperConservativeCleanupResult = Readonly<{
  cleanedText: string;
  cleanupApplied: boolean;
  cleanupAttempted: boolean;
  fallbackUsed: boolean;
  provider?: RubyWhisperProviderName;
  providerLatencyMs?: number;
}>;

export function createRubyWhisperConservativeCleanupPrompt(
  input: Omit<RubyWhisperConservativeCleanupInput, "providerClient">,
): readonly RubyWhisperCleanupPromptMessage[] {
  const transcriptText = normalizeCleanupText(input.transcriptText);

  if (!transcriptText) {
    return [];
  }

  const context =
    input.contextAwareCleanupEnabled === false
      ? undefined
      : normalizeCleanupContext(input.context);
  const dictionaryTerms = normalizeCleanupDictionaryTerms(input.dictionaryTerms);
  const userPromptSections = [
    "Clean this dictated transcript conservatively.",
    "",
    "Transcript:",
    transcriptText,
    ...(dictionaryTerms.length > 0
      ? ["", "Known terms to preserve:", dictionaryTerms.join(", ")]
      : []),
    ...(context ? ["", "Surrounding context:", context] : []),
    "",
    "Return only the final cleaned transcript text.",
  ];

  return [
    {
      content: rubyWhisperConservativeCleanupSystemPrompt,
      role: "system",
    },
    {
      content: userPromptSections.join("\n"),
      role: "user",
    },
  ];
}

export function createRubyWhisperProviderCleanupInput(
  input: Omit<RubyWhisperConservativeCleanupInput, "providerClient">,
): RubyWhisperProviderCleanupInput | undefined {
  const transcriptText = normalizeCleanupText(input.transcriptText);

  if (!transcriptText || !input.cleanupEnabled) {
    return undefined;
  }

  const context =
    input.contextAwareCleanupEnabled === false
      ? undefined
      : normalizeCleanupContext(input.context);
  const dictionaryTerms = normalizeCleanupDictionaryTerms(input.dictionaryTerms);
  const requestId = normalizeRequestId(input.requestId);

  return {
    cleanupEnabled: true,
    ...(context ? { context } : {}),
    contextAwareCleanupEnabled: input.contextAwareCleanupEnabled !== false,
    ...(dictionaryTerms.length > 0 ? { dictionaryTerms } : {}),
    ...(requestId ? { requestId } : {}),
    transcriptText,
  };
}

export async function runRubyWhisperConservativeCleanup(
  input: RubyWhisperConservativeCleanupInput,
): Promise<RubyWhisperConservativeCleanupResult> {
  const transcriptText = normalizeCleanupText(input.transcriptText);

  if (!transcriptText) {
    return createCleanupResult({
      cleanedText: "",
      cleanupApplied: false,
      cleanupAttempted: false,
      fallbackUsed: false,
    });
  }

  const providerInput = createRubyWhisperProviderCleanupInput(input);

  if (!providerInput) {
    return createCleanupResult({
      cleanedText: transcriptText,
      cleanupApplied: false,
      cleanupAttempted: false,
      fallbackUsed: false,
    });
  }

  let cleanupResult:
    | Awaited<ReturnType<RubyWhisperProviderClient["cleanup"]>>
    | undefined;

  try {
    cleanupResult = await input.providerClient.cleanup(providerInput);
  } catch {
    cleanupResult = undefined;
  }

  if (!cleanupResult?.ok) {
    return createCleanupResult({
      cleanedText: transcriptText,
      cleanupApplied: false,
      cleanupAttempted: true,
      fallbackUsed: true,
    });
  }

  const cleanedText = normalizeCleanupText(cleanupResult.result.cleanedText);

  if (!cleanedText) {
    return createCleanupResult({
      cleanedText: transcriptText,
      cleanupApplied: false,
      cleanupAttempted: true,
      fallbackUsed: true,
      provider: cleanupResult.result.provider,
      providerLatencyMs: cleanupResult.result.providerLatencyMs,
    });
  }

  return createCleanupResult({
    cleanedText,
    cleanupApplied: true,
    cleanupAttempted: true,
    fallbackUsed: false,
    provider: cleanupResult.result.provider,
    providerLatencyMs: cleanupResult.result.providerLatencyMs,
  });
}

function createCleanupResult(
  result: RubyWhisperConservativeCleanupResult,
): RubyWhisperConservativeCleanupResult {
  return {
    cleanedText: result.cleanedText,
    cleanupApplied: result.cleanupApplied,
    cleanupAttempted: result.cleanupAttempted,
    fallbackUsed: result.fallbackUsed,
    ...(result.provider ? { provider: result.provider } : {}),
    ...(typeof result.providerLatencyMs === "number"
      ? { providerLatencyMs: result.providerLatencyMs }
      : {}),
  };
}

function normalizeCleanupText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeCleanupContext(value: string | null | undefined) {
  const context = normalizeCleanupText(value);

  return context.length > 0 ? context.slice(0, 4000) : undefined;
}

function normalizeCleanupDictionaryTerms(values: readonly string[] | null | undefined) {
  const terms: string[] = [];
  const seenTerms = new Set<string>();

  for (const value of values ?? []) {
    const term = normalizeCleanupText(value);

    if (!term || term.length > 80 || seenTerms.has(term)) {
      continue;
    }

    terms.push(term);
    seenTerms.add(term);

    if (terms.length >= 50) {
      break;
    }
  }

  return terms;
}

function normalizeRequestId(value: string | null | undefined) {
  const requestId = normalizeCleanupText(value);

  return requestId.length > 0 && requestId.length <= 128 ? requestId : undefined;
}
