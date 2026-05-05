import "server-only";

import {
  createRubyWhisperPrivacyLogEvent,
  rubyWhisperPrivacyLogMetadataKeys,
  type RubyWhisperPrivacyLogEvent,
  type RubyWhisperPrivacyLogMetadataKey,
} from "./privacy-logger";

export const rubyWhisperErrorReportMetadataKeys =
  rubyWhisperPrivacyLogMetadataKeys;

export const rubyWhisperErrorReportEventNames = [
  "backend.error.reported",
  "backend.crash.reported",
] as const;

export type RubyWhisperErrorReportEventName =
  (typeof rubyWhisperErrorReportEventNames)[number];

export type RubyWhisperErrorReportInput = Partial<
  Record<RubyWhisperPrivacyLogMetadataKey, unknown>
> & {
  metadata?: Record<string, unknown>;
};

export type RubyWhisperErrorReport = RubyWhisperPrivacyLogEvent & {
  event: RubyWhisperErrorReportEventName;
};

export type RubyWhisperErrorReportSink = (
  report: RubyWhisperErrorReport,
) => void | Promise<void>;

export type RubyWhisperErrorReporterOptions = {
  sink?: RubyWhisperErrorReportSink;
};

export type RubyWhisperErrorReportResult = {
  report: RubyWhisperErrorReport;
  delivered: boolean;
};

export type RubyWhisperErrorReporter = {
  reportError: (
    input?: RubyWhisperErrorReportInput,
  ) => Promise<RubyWhisperErrorReportResult>;
  reportCrash: (
    input?: RubyWhisperErrorReportInput,
  ) => Promise<RubyWhisperErrorReportResult>;
};

export function createRubyWhisperErrorReporter(
  options: RubyWhisperErrorReporterOptions = {},
): RubyWhisperErrorReporter {
  const { sink } = options;

  return {
    reportError(input = {}) {
      return reportRubyWhisperErrorReport("backend.error.reported", input, sink);
    },
    reportCrash(input = {}) {
      return reportRubyWhisperErrorReport("backend.crash.reported", input, sink);
    },
  };
}

export const rubyWhisperNoopErrorReporter = createRubyWhisperErrorReporter();

async function reportRubyWhisperErrorReport(
  event: RubyWhisperErrorReportEventName,
  input: RubyWhisperErrorReportInput,
  sink: RubyWhisperErrorReportSink | undefined,
): Promise<RubyWhisperErrorReportResult> {
  const report = createRubyWhisperErrorReport(event, input);

  if (!sink) {
    return { report, delivered: false };
  }

  try {
    await sink(report);
    return { report, delivered: true };
  } catch {
    return { report, delivered: false };
  }
}

function createRubyWhisperErrorReport(
  event: RubyWhisperErrorReportEventName,
  input: RubyWhisperErrorReportInput,
): RubyWhisperErrorReport {
  const report = createRubyWhisperPrivacyLogEvent(event, {
    metadata: collectErrorReportMetadataInput(input),
  });

  return (report ?? { event }) as RubyWhisperErrorReport;
}

function collectErrorReportMetadataInput(input: RubyWhisperErrorReportInput) {
  const metadataInput: Record<string, unknown> = isRecord(input.metadata)
    ? { ...input.metadata }
    : {};

  for (const key of rubyWhisperErrorReportMetadataKeys) {
    if (Object.hasOwn(input, key)) {
      metadataInput[key] = input[key];
    }
  }

  return metadataInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
