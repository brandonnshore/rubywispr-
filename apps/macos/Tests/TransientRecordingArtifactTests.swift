import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
    return true
}

private func makeScratchDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("TransientRecordingArtifactTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

private func testArtifactDeleteIsIdempotentAndMetadataOnly() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }

    let fileURL = scratch.appendingPathComponent("artifact.wav")
    try Data([0x00, 0x01, 0x02]).write(to: fileURL)

    let artifact = TransientRecordingArtifact(
        fileURL: fileURL,
        metadata: RecordingArtifactMetadata(
            durationMs: 1_234,
            format: RecordingArtifactMetadata.wavPCM16Mono16k,
            byteCount: 3
        )
    )

    expect(artifact.metadata.durationMs == 1_234, "duration should be safe numeric metadata")
    expect(artifact.metadata.format == RecordingArtifactMetadata.wavPCM16Mono16k, "format should be safe categorical metadata")
    expect(artifact.metadata.byteCount == 3, "byte count should be safe numeric metadata")

    let firstCleanup = artifact.delete()
    expect(firstCleanup == RecordingArtifactCleanupResult(attemptedCount: 1, deletedCount: 1, failedCount: 0), "first delete should remove file")
    expect(!FileManager.default.fileExists(atPath: fileURL.path), "delete should remove transient audio")

    let secondCleanup = artifact.delete()
    expect(secondCleanup == .noOp, "second delete should be idempotent")
}

private func testStoreCleanupDeletesOnlyOwnedWavArtifacts() throws {
    let scratch = try makeScratchDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }

    let directory = TransientRecordingArtifactStore.transientDirectory(baseDirectory: scratch)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

    let first = directory.appendingPathComponent("first.wav")
    let second = directory.appendingPathComponent("second.WAV")
    let unrelated = directory.appendingPathComponent("keep.txt")
    try Data([0x00]).write(to: first)
    try Data([0x01]).write(to: second)
    try Data([0x02]).write(to: unrelated)

    let result = TransientRecordingArtifactStore.cleanupStaleArtifacts(baseDirectory: scratch)
    expect(result == RecordingArtifactCleanupResult(attemptedCount: 2, deletedCount: 2, failedCount: 0), "cleanup should delete owned wav artifacts")
    expect(!FileManager.default.fileExists(atPath: first.path), "cleanup should delete first wav")
    expect(!FileManager.default.fileExists(atPath: second.path), "cleanup should delete second wav case-insensitively")
    expect(FileManager.default.fileExists(atPath: unrelated.path), "cleanup should leave unrelated files alone")
}

@main
private struct TransientRecordingArtifactTests {
    static func main() {
        do {
            try testArtifactDeleteIsIdempotentAndMetadataOnly()
            try testStoreCleanupDeletesOnlyOwnedWavArtifacts()
            print("TransientRecordingArtifactTests passed")
        } catch {
            fputs("FAIL: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
}
