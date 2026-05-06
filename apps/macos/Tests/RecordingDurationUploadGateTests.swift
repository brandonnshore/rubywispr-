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
        .appendingPathComponent("RecordingDurationUploadGateTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

private func makeArtifact(
    durationMs: Int,
    scratch: URL,
    name: String
) throws -> TransientRecordingArtifact {
    let fileURL = scratch.appendingPathComponent(name)
    try Data([0x52, 0x57, 0x05]).write(to: fileURL)
    return TransientRecordingArtifact(
        fileURL: fileURL,
        metadata: RecordingArtifactMetadata(
            durationMs: durationMs,
            format: RecordingArtifactMetadata.wavPCM16Mono16k,
            byteCount: 3
        )
    )
}

private func testUnderLimitArtifactCanProceedWithoutCleanup() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let artifact = try makeArtifact(durationMs: 999, scratch: scratch, name: "under.wav")

    let rejection = RecordingDurationUploadGate.rejectIfDurationLimitReached(
        artifact,
        policy: .shortenedUnitTimer
    )

    expect(rejection == nil, "under-limit artifact should be eligible for upload")
    expect(FileManager.default.fileExists(atPath: artifact.fileURL.path), "under-limit artifact should not be deleted by the gate")
}

private func testLimitReachedArtifactIsRejectedAndDeleted() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let artifact = try makeArtifact(durationMs: 1_000, scratch: scratch, name: "limit.wav")

    let rejection = RecordingDurationUploadGate.rejectIfDurationLimitReached(
        artifact,
        policy: .shortenedUnitTimer
    )

    expect(rejection?.audioDurationMs == 1_000, "rejection should carry numeric audio duration metadata")
    expect(rejection?.durationLimitMs == 1_000, "rejection should carry numeric duration limit metadata")
    expect(rejection?.policyCategory == .shortenedUnitTimer, "rejection should carry metadata-only test policy category")
    expect(rejection?.cleanupSucceeded == true, "rejection should report successful cleanup")
    expect(
        rejection?.cleanupResult == RecordingArtifactCleanupResult(attemptedCount: 1, deletedCount: 1, failedCount: 0),
        "rejection should delete the transient audio artifact"
    )
    expect(!FileManager.default.fileExists(atPath: artifact.fileURL.path), "limit-reached artifact should be removed")
}

private func testOverLimitArtifactCleanupIsIdempotent() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let artifact = try makeArtifact(durationMs: 1_001, scratch: scratch, name: "over.wav")

    let first = RecordingDurationUploadGate.rejectIfDurationLimitReached(
        artifact,
        policy: .shortenedUnitTimer
    )
    let second = RecordingDurationUploadGate.rejectIfDurationLimitReached(
        artifact,
        policy: .shortenedUnitTimer
    )

    expect(first?.cleanupResult.deletedCount == 1, "first rejection should delete over-limit audio")
    expect(second?.cleanupResult == .noOp, "second rejection should not retry transient cleanup")
    expect(!FileManager.default.fileExists(atPath: artifact.fileURL.path), "over-limit artifact should stay removed")
}

@main
private struct RecordingDurationUploadGateTests {
    static func main() {
        do {
            try testUnderLimitArtifactCanProceedWithoutCleanup()
            try testLimitReachedArtifactIsRejectedAndDeleted()
            try testOverLimitArtifactCleanupIsIdempotent()
            print("RecordingDurationUploadGateTests passed")
        } catch {
            FileHandle.standardError.write(Data("FAIL: \(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
}
