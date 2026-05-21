import Foundation

struct RecordingArtifactReadinessRejection: Equatable {
    let audioDurationMs: Int
    let minimumDurationMs: Int
    let cleanupResult: RecordingArtifactCleanupResult

    var cleanupSucceeded: Bool {
        cleanupResult.succeeded
    }
}

enum RecordingArtifactReadinessGate {
    // Accidental taps can still create a tiny WAV file. Treat sub-500ms
    // artifacts as "no speech" so we never spend seconds on cloud transcription.
    static let minimumTranscribableDurationMs = 500

    static func rejectIfTooShort(
        _ artifact: TransientRecordingArtifact,
        minimumDurationMs: Int = minimumTranscribableDurationMs
    ) -> RecordingArtifactReadinessRejection? {
        guard artifact.metadata.durationMs < minimumDurationMs else {
            return nil
        }

        return RecordingArtifactReadinessRejection(
            audioDurationMs: artifact.metadata.durationMs,
            minimumDurationMs: minimumDurationMs,
            cleanupResult: artifact.delete()
        )
    }
}
