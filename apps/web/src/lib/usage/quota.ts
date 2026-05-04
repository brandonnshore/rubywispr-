import "server-only";

export const rubyWhisperDefaultTrialWordsLimit = 5_000 as const;
export const rubyWhisperTrialLowWordsRemainingThreshold = 500 as const;

export const rubyWhisperUsagePlanStates = [
  "trial_active",
  "trial_exhausted",
  "paid_active",
  "friend_of_ruby_active",
  "payment_failed",
  "blocked",
  "subscription_required",
] as const;

export type RubyWhisperUsagePlanState =
  (typeof rubyWhisperUsagePlanStates)[number];

export type RubyWhisperTrialQuotaState = Readonly<{
  isTrialExhausted: boolean;
  isTrialLow: boolean;
  trialWordsLimit: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
}>;

export type RubyWhisperUsageQuotaState = RubyWhisperTrialQuotaState &
  Readonly<{
    canTranscribe: boolean;
    planState: RubyWhisperUsagePlanState;
  }>;

export type RubyWhisperTrialQuotaInput = Readonly<{
  trialWordsLimit?: unknown;
  trialWordsUsed?: unknown;
}>;

export type RubyWhisperUsageQuotaInput = RubyWhisperTrialQuotaInput &
  Readonly<{
    friendOfRubyUntil?: Date | string | null;
    hasActiveSubscription?: boolean;
    isBlocked?: boolean;
    now?: Date | string;
    paymentFailed?: boolean;
    planState?: string | null;
  }>;

const wordFallbackPattern =
  /[\p{L}\p{N}]+(?:['’\u2010-\u2015-][\p{L}\p{N}]+)*/gu;
const wordSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("en", { granularity: "word" })
    : undefined;

export function countRubyWhisperBillableOutputWords(
  outputText: string | null | undefined,
): number {
  if (!outputText) {
    return 0;
  }

  const normalizedOutputText = outputText.normalize("NFKC").trim();

  if (!normalizedOutputText) {
    return 0;
  }

  if (wordSegmenter) {
    let count = 0;

    for (const segment of wordSegmenter.segment(normalizedOutputText)) {
      if (segment.isWordLike) {
        count += 1;
      }
    }

    return count;
  }

  return [...normalizedOutputText.matchAll(wordFallbackPattern)].length;
}

export function normalizeRubyWhisperUsageWordCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function createRubyWhisperTrialQuotaState(
  input: RubyWhisperTrialQuotaInput = {},
): RubyWhisperTrialQuotaState {
  const requestedLimit = normalizeRubyWhisperUsageWordCount(
    input.trialWordsLimit,
  );
  const trialWordsLimit =
    requestedLimit > 0 ? requestedLimit : rubyWhisperDefaultTrialWordsLimit;
  const trialWordsUsed = Math.min(
    normalizeRubyWhisperUsageWordCount(input.trialWordsUsed),
    trialWordsLimit,
  );
  const trialWordsRemaining = Math.max(0, trialWordsLimit - trialWordsUsed);

  return {
    isTrialExhausted: trialWordsRemaining === 0,
    isTrialLow:
      trialWordsRemaining > 0 &&
      trialWordsRemaining <= rubyWhisperTrialLowWordsRemainingThreshold,
    trialWordsLimit,
    trialWordsRemaining,
    trialWordsUsed,
  };
}

export function createRubyWhisperUsageQuotaState(
  input: RubyWhisperUsageQuotaInput = {},
): RubyWhisperUsageQuotaState {
  const trialQuota = createRubyWhisperTrialQuotaState(input);
  const normalizedPlanState = normalizeUsagePlanState(input.planState);

  if (input.isBlocked || normalizedPlanState === "blocked") {
    return createUsageQuotaState("blocked", false, trialQuota);
  }

  if (input.paymentFailed || normalizedPlanState === "payment_failed") {
    return createUsageQuotaState("payment_failed", false, trialQuota);
  }

  if (
    input.hasActiveSubscription ||
    normalizedPlanState === "paid_active"
  ) {
    return createUsageQuotaState("paid_active", true, trialQuota);
  }

  if (
    normalizedPlanState === "friend_of_ruby_active" ||
    isFutureDate(input.friendOfRubyUntil, input.now)
  ) {
    return createUsageQuotaState("friend_of_ruby_active", true, trialQuota);
  }

  if (
    normalizedPlanState === "subscription_required" &&
    trialQuota.isTrialExhausted
  ) {
    return createUsageQuotaState("subscription_required", false, trialQuota);
  }

  if (
    normalizedPlanState === "trial_exhausted" ||
    trialQuota.isTrialExhausted
  ) {
    return createUsageQuotaState("trial_exhausted", false, trialQuota);
  }

  return createUsageQuotaState("trial_active", true, trialQuota);
}

function createUsageQuotaState(
  planState: RubyWhisperUsagePlanState,
  canTranscribe: boolean,
  trialQuota: RubyWhisperTrialQuotaState,
): RubyWhisperUsageQuotaState {
  return {
    ...trialQuota,
    canTranscribe,
    planState,
  };
}

function normalizeUsagePlanState(
  planState: string | null | undefined,
): RubyWhisperUsagePlanState | undefined {
  if (!planState) {
    return undefined;
  }

  return rubyWhisperUsagePlanStates.find((state) => state === planState);
}

function isFutureDate(
  value: Date | string | null | undefined,
  nowInput: Date | string | undefined,
) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const now = nowInput ? new Date(nowInput) : new Date();

  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}
