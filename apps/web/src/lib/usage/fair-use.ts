import "server-only";

import type { RubyWhisperUsagePlanState } from "./quota";

export const rubyWhisperFairUseSignalStates = [
  "normal",
  "watch",
  "limit_recommended",
  "delegated",
] as const;

export type RubyWhisperFairUseSignalState =
  (typeof rubyWhisperFairUseSignalStates)[number];

export type RubyWhisperFairUseThresholdLevel =
  | "watch"
  | "limit_recommended";

export type RubyWhisperFairUseMetric =
  | "monthly_words_used"
  | "lifetime_words_used"
  | "rolling_request_count"
  | "rolling_audio_duration_ms";

export type RubyWhisperFairUseThresholdSet = Readonly<{
  limitRecommended?: unknown;
  watch?: unknown;
}>;

export type RubyWhisperFairUseSignalPolicy = Readonly<{
  lifetimeWordsUsed?: RubyWhisperFairUseThresholdSet;
  monthlyWordsUsed?: RubyWhisperFairUseThresholdSet;
  rollingAudioDurationMs?: RubyWhisperFairUseThresholdSet;
  rollingRequestCount?: RubyWhisperFairUseThresholdSet;
}>;

export const rubyWhisperDefaultFairUseSignalPolicy: RubyWhisperFairUseSignalPolicy =
  {} as const;

export type RubyWhisperFairUseSignalInput = Readonly<{
  lifetimeWordsUsed?: unknown;
  monthlyWordsUsed?: unknown;
  planState?: RubyWhisperUsagePlanState | string | null;
  policy?: RubyWhisperFairUseSignalPolicy;
  rollingAudioDurationMs?: unknown;
  rollingRequestCount?: unknown;
}>;

export type RubyWhisperFairUseThresholdMatch = Readonly<{
  level: RubyWhisperFairUseThresholdLevel;
  metric: RubyWhisperFairUseMetric;
  threshold: number;
  value: number;
}>;

export type RubyWhisperFairUseSignalMetadata = Readonly<{
  evaluated: boolean;
  matchedThresholds: readonly RubyWhisperFairUseThresholdMatch[];
  planState:
    | "paid_active"
    | "friend_of_ruby_active"
    | "delegated"
    | "unknown";
  signal: RubyWhisperFairUseSignalState;
}>;

export type RubyWhisperFairUseSignalResult = Readonly<{
  enforce: false;
  metadata: RubyWhisperFairUseSignalMetadata;
  ok: true;
  signal: RubyWhisperFairUseSignalState;
  status: RubyWhisperFairUseSignalState;
}>;

type FairUseMetricEvaluation = Readonly<{
  metric: RubyWhisperFairUseMetric;
  thresholds?: RubyWhisperFairUseThresholdSet;
  value: number;
}>;

export function evaluateRubyWhisperFairUseSignal(
  input: RubyWhisperFairUseSignalInput = {},
): RubyWhisperFairUseSignalResult {
  const planState = normalizePaidFairUsePlanState(input.planState);

  if (!planState) {
    return createFairUseSignalResult({
      evaluated: false,
      matchedThresholds: [],
      planState:
        normalizeDelegatedFairUsePlanState(input.planState) ?? "unknown",
      signal: "delegated",
    });
  }

  const policy = input.policy ?? rubyWhisperDefaultFairUseSignalPolicy;
  const matchedThresholds = collectFairUseThresholdMatches([
    {
      metric: "monthly_words_used",
      thresholds: policy.monthlyWordsUsed,
      value: normalizeFairUseCount(input.monthlyWordsUsed),
    },
    {
      metric: "lifetime_words_used",
      thresholds: policy.lifetimeWordsUsed,
      value: normalizeFairUseCount(input.lifetimeWordsUsed),
    },
    {
      metric: "rolling_request_count",
      thresholds: policy.rollingRequestCount,
      value: normalizeFairUseCount(input.rollingRequestCount),
    },
    {
      metric: "rolling_audio_duration_ms",
      thresholds: policy.rollingAudioDurationMs,
      value: normalizeFairUseCount(input.rollingAudioDurationMs),
    },
  ]);
  const signal = signalForThresholdMatches(matchedThresholds);

  return createFairUseSignalResult({
    evaluated: true,
    matchedThresholds,
    planState,
    signal,
  });
}

function collectFairUseThresholdMatches(
  evaluations: readonly FairUseMetricEvaluation[],
): readonly RubyWhisperFairUseThresholdMatch[] {
  return evaluations.flatMap((evaluation) => {
    const matches: RubyWhisperFairUseThresholdMatch[] = [];
    const watchThreshold = normalizeFairUseThreshold(
      evaluation.thresholds?.watch,
    );
    const limitThreshold = normalizeFairUseThreshold(
      evaluation.thresholds?.limitRecommended,
    );

    if (watchThreshold && evaluation.value >= watchThreshold) {
      matches.push({
        level: "watch",
        metric: evaluation.metric,
        threshold: watchThreshold,
        value: evaluation.value,
      });
    }

    if (limitThreshold && evaluation.value >= limitThreshold) {
      matches.push({
        level: "limit_recommended",
        metric: evaluation.metric,
        threshold: limitThreshold,
        value: evaluation.value,
      });
    }

    return matches;
  });
}

function signalForThresholdMatches(
  matches: readonly RubyWhisperFairUseThresholdMatch[],
): RubyWhisperFairUseSignalState {
  if (matches.some((match) => match.level === "limit_recommended")) {
    return "limit_recommended";
  }

  if (matches.some((match) => match.level === "watch")) {
    return "watch";
  }

  return "normal";
}

function createFairUseSignalResult(
  metadata: RubyWhisperFairUseSignalMetadata,
): RubyWhisperFairUseSignalResult {
  return {
    enforce: false,
    metadata,
    ok: true,
    signal: metadata.signal,
    status: metadata.signal,
  };
}

function normalizePaidFairUsePlanState(
  value: RubyWhisperUsagePlanState | string | null | undefined,
) {
  if (value === "paid_active" || value === "friend_of_ruby_active") {
    return value;
  }

  return undefined;
}

function normalizeDelegatedFairUsePlanState(
  value: RubyWhisperUsagePlanState | string | null | undefined,
): "delegated" | undefined {
  if (
    value === "trial_active" ||
    value === "trial_exhausted" ||
    value === "payment_failed" ||
    value === "blocked" ||
    value === "subscription_required"
  ) {
    return "delegated";
  }

  return undefined;
}

function normalizeFairUseCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeFairUseThreshold(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const threshold = Math.floor(value);

  return threshold > 0 ? threshold : undefined;
}
