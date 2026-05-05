import Foundation
import AppKit
import UniformTypeIdentifiers

/// Exports metadata for a pipeline history item as a self-contained ZIP.
///
/// ZIP contents:
///   case.json       – privacy-safe lifecycle/status metadata only
struct TestCaseExporter {

    enum ExportError: Error, LocalizedError {
        case tempDirectoryCreationFailed(underlying: Error?)
        case zipFailed(Int32)

        var errorDescription: String? {
            switch self {
            case .tempDirectoryCreationFailed(let underlying):
                if let underlying {
                    return "Could not create temporary export directory: \(underlying.localizedDescription)"
                }
                return "Could not create temporary export directory"
            case .zipFailed(let code): return "zip exited with code \(code)"
            }
        }
    }

    /// Presents a NSSavePanel and writes the ZIP to the chosen location.
    /// Must be called on the main thread.
    @MainActor
    static func exportWithSavePanel(
        item: PipelineHistoryItem,
        audioDirURL: URL? = nil
    ) {
        _ = audioDirURL
        let timestamp = isoTimestamp(from: item.timestamp)
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType.zip]
        panel.nameFieldStringValue = "rubywhisper-case-\(timestamp).zip"
        panel.title = "Export Test Case"
        panel.message = "Choose where to save the test case ZIP."
        panel.begin { response in
            guard response == .OK, let destination = panel.url else { return }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    try writeZip(
                        item: item,
                        audioDirURL: audioDirURL,
                        timestamp: timestamp,
                        to: destination
                    )
                } catch {
                    DispatchQueue.main.async {
                        let alert = NSAlert()
                        alert.messageText = "Export Failed"
                        alert.informativeText = error.localizedDescription
                        alert.runModal()
                    }
                }
            }
        }
    }

    // MARK: - Private

    private static func writeZip(
        item: PipelineHistoryItem,
        audioDirURL: URL?,
        timestamp: String,
        to destination: URL
    ) throws {
        _ = audioDirURL
        let fm = FileManager.default
        let tempDir = fm.temporaryDirectory
            .appendingPathComponent("rubywhisper-case-\(UUID().uuidString)", isDirectory: true)
        defer { try? fm.removeItem(at: tempDir) }

        do {
            try fm.createDirectory(at: tempDir, withIntermediateDirectories: true)
        } catch {
            throw ExportError.tempDirectoryCreationFailed(underlying: error)
        }

        let pipeline: [String: Any] = [
            "post_processing_status": item.postProcessingStatus,
            "screenshot_status": item.contextScreenshotStatus,
            "debug_status": item.debugStatus,
            "has_audio_artifact": false,
            "has_source_text_payload": !item.rawTranscript.isEmpty,
            "has_final_text_payload": !item.postProcessedTranscript.isEmpty,
            "has_context_payload": !item.contextSummary.isEmpty || item.contextScreenshotDataURL != nil,
            "has_post_processing_prompt": item.postProcessingPrompt?.isEmpty == false
        ]

        let json: [String: Any] = [
            "id": "case-\(timestamp)",
            "exported_at": ISO8601DateFormatter().string(from: Date()),
            "intent": item.intent.rawValue,
            "run_uuid": item.id.uuidString,
            "run_timestamp": ISO8601DateFormatter().string(from: item.timestamp),
            "metadata": [
                "app_name": item.contextAppName ?? "",
                "bundle_identifier": item.contextBundleIdentifier ?? ""
            ] as [String: Any],
            "pipeline": pipeline
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys])
        try jsonData.write(to: tempDir.appendingPathComponent("case.json"))

        let archiveWorkDir = tempDir.appendingPathComponent("__archive-work", isDirectory: true)
        try fm.createDirectory(at: archiveWorkDir, withIntermediateDirectories: true)
        let destinationTemp = archiveWorkDir.appendingPathComponent("\(UUID().uuidString).zip")
        let archiveContents = try fm.contentsOfDirectory(atPath: tempDir.path)
            .filter { $0 != archiveWorkDir.lastPathComponent }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/zip")
        process.arguments = ["-r", destinationTemp.path] + archiveContents
        process.currentDirectoryURL = tempDir
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw ExportError.zipFailed(process.terminationStatus) }
        if fm.fileExists(atPath: destination.path) {
            _ = try fm.replaceItemAt(destination, withItemAt: destinationTemp)
        } else {
            try fm.moveItem(at: destinationTemp, to: destination)
        }
    }

    private static func isoTimestamp(from date: Date = Date()) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime]
        return f.string(from: date).replacingOccurrences(of: ":", with: "-")
    }
}
