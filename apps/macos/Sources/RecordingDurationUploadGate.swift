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
    static func rejectIfDurationLimitReached(
        _ artifact: TransientRecordingArtifact,
        policy: RecordingDurationPolicy = .production
    ) -> RecordingDurationLimitRejection? {
        guard artifact.metadata.durationMs >= policy.limitMs else {
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
