import Foundation

struct RecordingArtifactMetadata: Equatable {
    static let wavPCM16Mono16k = "wav/pcm_s16le/16000hz/mono"

    let durationMs: Int
    let format: String
    let byteCount: Int64
}

struct RecordingArtifactCleanupResult: Equatable {
    let attemptedCount: Int
    let deletedCount: Int
    let failedCount: Int

    var succeeded: Bool {
        failedCount == 0
    }

    static var noOp: RecordingArtifactCleanupResult {
        RecordingArtifactCleanupResult(attemptedCount: 0, deletedCount: 0, failedCount: 0)
    }
}

final class TransientRecordingArtifact {
    let fileURL: URL
    let metadata: RecordingArtifactMetadata

    private let fileManager: FileManager
    private var cleanupAttempted = false

    init(
        fileURL: URL,
        metadata: RecordingArtifactMetadata,
        fileManager: FileManager = .default
    ) {
        self.fileURL = fileURL
        self.metadata = metadata
        self.fileManager = fileManager
    }

    @discardableResult
    func delete() -> RecordingArtifactCleanupResult {
        guard !cleanupAttempted else {
            return .noOp
        }
        cleanupAttempted = true

        guard fileManager.fileExists(atPath: fileURL.path) else {
            return RecordingArtifactCleanupResult(attemptedCount: 1, deletedCount: 0, failedCount: 0)
        }

        do {
            try fileManager.removeItem(at: fileURL)
            return RecordingArtifactCleanupResult(attemptedCount: 1, deletedCount: 1, failedCount: 0)
        } catch {
            return RecordingArtifactCleanupResult(attemptedCount: 1, deletedCount: 0, failedCount: 1)
        }
    }

    deinit {
        _ = delete()
    }
}

enum TransientRecordingArtifactStore {
    static let directoryName = "rubywhisper-transient-recordings"

    static func transientDirectory(
        baseDirectory: URL = FileManager.default.temporaryDirectory
    ) -> URL {
        baseDirectory.appendingPathComponent(directoryName, isDirectory: true)
    }

    static func makeRecordingURL(
        baseDirectory: URL = FileManager.default.temporaryDirectory,
        fileManager: FileManager = .default
    ) throws -> URL {
        let directory = transientDirectory(baseDirectory: baseDirectory)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try excludeFromBackup(directory)
        return directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("wav")
    }

    @discardableResult
    static func cleanupStaleArtifacts(
        baseDirectory: URL = FileManager.default.temporaryDirectory,
        fileManager: FileManager = .default
    ) -> RecordingArtifactCleanupResult {
        let directory = transientDirectory(baseDirectory: baseDirectory)
        guard let contents = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return .noOp
        }

        var deletedCount = 0
        var failedCount = 0
        for url in contents where url.pathExtension.lowercased() == "wav" {
            do {
                try fileManager.removeItem(at: url)
                deletedCount += 1
            } catch {
                failedCount += 1
            }
        }

        return RecordingArtifactCleanupResult(
            attemptedCount: deletedCount + failedCount,
            deletedCount: deletedCount,
            failedCount: failedCount
        )
    }

    private static func excludeFromBackup(_ url: URL) throws {
        var directory = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }
}
