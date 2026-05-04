import "server-only";

export const rubyWhisperTrialWordsDefaultLimit = 5_000;
export const rubyWhisperTrialWordsLowRemainingThreshold = 500;

export const rubyWhisperQuotaStates = [
  "trial_active",
  "trial_low",
  "trial_exhausted",
  "paid_active",
  "friend_of_ruby_active",
  "blocked",
  "subscription_required",
] as const;

export type RubyWhisperQuotaState = (typeof rubyWhisperQuotaStates)[number];

export type RubyWhisperQuotaEntitlement =
  | "trial"
  | "paid"
  | "friend_of_ruby"
  | "blocked"
  | "subscription_required";

export type RubyWhisperTrialQuotaInput = Readonly<{
  trialWordsLimit?: number | null;
  trialWordsLowRemainingThreshold?: number | null;
  trialWordsUsed?: number | null;
}>;

export type RubyWhisperQuotaStateInput = RubyWhisperTrialQuotaInput &
  Readonly<{
    blocked?: boolean | null;
    entitlement?: RubyWhisperQuotaEntitlement | null;
    friendOfRuby?: boolean | null;
    paid?: boolean | null;
    subscriptionRequired?: boolean | null;
  }>;

export type RubyWhisperTrialQuotaSnapshot = Readonly<{
  exhausted: boolean;
  low: boolean;
  state: Extract<
    RubyWhisperQuotaState,
    "trial_active" | "trial_low" | "trial_exhausted"
  >;
  trialWordsLimit: number;
  trialWordsLowRemainingThreshold: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
}>;

export type RubyWhisperQuotaStateSnapshot = Omit<
  RubyWhisperTrialQuotaSnapshot,
  "state"
> &
  Readonly<{
    canTranscribe: boolean;
    entitlement: RubyWhisperQuotaEntitlement;
    requiresSubscription: boolean;
    state: RubyWhisperQuotaState;
    trialState: RubyWhisperTrialQuotaSnapshot["state"];
  }>;

const billableOutputWordPattern =
  /[\p{L}\p{N}]+(?:['’\u2010\u2011-][\p{L}\p{N}]+)*/gu;

export function countBillableOutputWords(
  outputText: string | null | undefined,
): number {
  if (!outputText) {
    return 0;
  }

  return Array.from(outputText.normalize("NFC").matchAll(billableOutputWordPattern))
    .length;
}

export function normalizeUsageCounter(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export function normalizeTrialWordsLimit(
  value: number | null | undefined = rubyWhisperTrialWordsDefaultLimit,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return rubyWhisperTrialWordsDefaultLimit;
  }

  return Math.floor(value);
}

export function getTrialWordsRemaining(
  input: RubyWhisperTrialQuotaInput = {},
): number {
  const used = normalizeUsageCounter(input.trialWordsUsed);
  const limit = normalizeTrialWordsLimit(input.trialWordsLimit);

  return Math.max(limit - used, 0);
}

export function isTrialQuotaExhausted(
  input: RubyWhisperTrialQuotaInput = {},
): boolean {
  return getTrialWordsRemaining(input) === 0;
}

export function deriveTrialQuotaSnapshot(
  input: RubyWhisperTrialQuotaInput = {},
): RubyWhisperTrialQuotaSnapshot {
  const trialWordsUsed = normalizeUsageCounter(input.trialWordsUsed);
  const trialWordsLimit = normalizeTrialWordsLimit(input.trialWordsLimit);
  const trialWordsRemaining = Math.max(trialWordsLimit - trialWordsUsed, 0);
  const trialWordsLowRemainingThreshold = normalizeUsageCounter(
    input.trialWordsLowRemainingThreshold ??
      rubyWhisperTrialWordsLowRemainingThreshold,
  );
  const exhausted = trialWordsRemaining === 0;
  const low =
    !exhausted && trialWordsRemaining <= trialWordsLowRemainingThreshold;

  return {
    exhausted,
    low,
    state: exhausted ? "trial_exhausted" : low ? "trial_low" : "trial_active",
    trialWordsLimit,
    trialWordsLowRemainingThreshold,
    trialWordsRemaining,
    trialWordsUsed,
  };
}

export function deriveRubyWhisperQuotaState(
  input: RubyWhisperQuotaStateInput = {},
): RubyWhisperQuotaStateSnapshot {
  const trialQuota = deriveTrialQuotaSnapshot(input);
  const entitlement = resolveQuotaEntitlement(input);

  if (entitlement === "blocked") {
    return {
      ...trialQuota,
      canTranscribe: false,
      entitlement,
      requiresSubscription: false,
      state: "blocked",
      trialState: trialQuota.state,
    };
  }

  if (entitlement === "friend_of_ruby") {
    return {
      ...trialQuota,
      canTranscribe: true,
      entitlement,
      requiresSubscription: false,
      state: "friend_of_ruby_active",
      trialState: trialQuota.state,
    };
  }

  if (entitlement === "paid") {
    return {
      ...trialQuota,
      canTranscribe: true,
      entitlement,
      requiresSubscription: false,
      state: "paid_active",
      trialState: trialQuota.state,
    };
  }

  if (entitlement === "subscription_required") {
    return {
      ...trialQuota,
      canTranscribe: false,
      entitlement,
      requiresSubscription: true,
      state: "subscription_required",
      trialState: trialQuota.state,
    };
  }

  return {
    ...trialQuota,
    canTranscribe: !trialQuota.exhausted,
    entitlement,
    requiresSubscription: trialQuota.exhausted,
    state: trialQuota.state,
    trialState: trialQuota.state,
  };
}

function resolveQuotaEntitlement(
  input: RubyWhisperQuotaStateInput,
): RubyWhisperQuotaEntitlement {
  if (input.blocked || input.entitlement === "blocked") {
    return "blocked";
  }

  if (input.friendOfRuby || input.entitlement === "friend_of_ruby") {
    return "friend_of_ruby";
  }

  if (input.paid || input.entitlement === "paid") {
    return "paid";
  }

  if (
    input.subscriptionRequired ||
    input.entitlement === "subscription_required"
  ) {
    return "subscription_required";
  }

  return "trial";
}
