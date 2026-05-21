import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

private func makeScratchDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("RecordingArtifactReadinessGateTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

private func makeArtifact(
    durationMs: Int,
    scratch: URL,
    name: String
) throws -> TransientRecordingArtifact {
    let fileURL = scratch.appendingPathComponent(name)
    try Data([0x52, 0x49, 0x46, 0x46]).write(to: fileURL)
    return TransientRecordingArtifact(
        fileURL: fileURL,
        metadata: RecordingArtifactMetadata(
            durationMs: durationMs,
            format: RecordingArtifactMetadata.wavPCM16Mono16k,
            byteCount: 4
        )
    )
}

private func testTinyArtifactIsRejectedAndDeleted() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let artifact = try makeArtifact(durationMs: 120, scratch: scratch, name: "tiny.wav")

    let rejection = RecordingArtifactReadinessGate.rejectIfTooShort(artifact)

    expect(rejection?.audioDurationMs == 120, "tiny artifact should report its audio duration")
    expect(
        rejection?.minimumDurationMs == RecordingArtifactReadinessGate.minimumTranscribableDurationMs,
        "tiny artifact should report the configured readiness threshold"
    )
    expect(rejection?.cleanupResult.deletedCount == 1, "tiny artifact should be deleted immediately")
    expect(!FileManager.default.fileExists(atPath: artifact.fileURL.path), "tiny artifact file should not remain on disk")
}

private func testThresholdArtifactCanProceedWithoutCleanup() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let artifact = try makeArtifact(
        durationMs: RecordingArtifactReadinessGate.minimumTranscribableDurationMs,
        scratch: scratch,
        name: "threshold.wav"
    )

    let rejection = RecordingArtifactReadinessGate.rejectIfTooShort(artifact)

    expect(rejection == nil, "threshold-duration artifact should be eligible for transcription")
    expect(FileManager.default.fileExists(atPath: artifact.fileURL.path), "eligible artifact should not be deleted by the gate")
}

private func testTinyArtifactCleanupIsIdempotent() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let artifact = try makeArtifact(durationMs: 0, scratch: scratch, name: "empty.wav")

    let first = RecordingArtifactReadinessGate.rejectIfTooShort(artifact)
    let second = RecordingArtifactReadinessGate.rejectIfTooShort(artifact)

    expect(first?.cleanupResult.deletedCount == 1, "first tiny-artifact rejection should delete audio")
    expect(second?.cleanupResult == .noOp, "second tiny-artifact rejection should not retry cleanup")
    expect(!FileManager.default.fileExists(atPath: artifact.fileURL.path), "tiny artifact should stay removed")
}

@main
private struct RecordingArtifactReadinessGateTests {
    static func main() {
        do {
            try testTinyArtifactIsRejectedAndDeleted()
            try testThresholdArtifactCanProceedWithoutCleanup()
            try testTinyArtifactCleanupIsIdempotent()
            print("RecordingArtifactReadinessGateTests passed")
        } catch {
            FileHandle.standardError.write(Data("FAIL: \(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
}
