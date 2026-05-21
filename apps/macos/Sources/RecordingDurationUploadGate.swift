import Foundation

struct RecordingDurationLimitRejection: Equatable {
    let audioDurationMs: Int
    let durationLimitMs: Int
    let policyCategory: RecordingDurationPolicyCategory
    let cleanupResult: RecordingArtifactCleanupResult

    var cleanupSucceeded: Bool {
        cleanupResult.succeeded
    }
}

enum RecordingDurationUploadGate {
    // The UI timer auto-stops at the recording cap, but AVCapture-derived audio
    // duration can land a few ticks over the wall-clock limit. Allow a small
    // grace window so capped recordings can still be transcribed instead of
    // being discarded at the moment the user most needs recovery.
    static let durationLimitGraceMs = 5_000

    static func rejectIfDurationLimitReached(
        _ artifact: TransientRecordingArtifact,
        policy: RecordingDurationPolicy = .production
    ) -> RecordingDurationLimitRejection? {
        guard artifact.metadata.durationMs > policy.limitMs + durationLimitGraceMs else {
            return nil
        }

        return RecordingDurationLimitRejection(
            audioDurationMs: artifact.metadata.durationMs,
            durationLimitMs: policy.limitMs,
            policyCategory: policy.category,
            cleanupResult: artifact.delete()
        )
    }
}
