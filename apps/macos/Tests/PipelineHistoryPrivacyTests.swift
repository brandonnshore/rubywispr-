import Darwin
import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

@main
private struct PipelineHistoryPrivacyTests {
    private static let forbiddenValue = "forbidden_fixture_value"
    private static let safeTimingSummary = "stop_to_audio_ms=20 upload_response_ms=450 total_stop_to_terminal_ms=500 status=inserted"
    private static let store = PipelineHistoryStore(storeURL: nil, inMemory: true)

    static func main() throws {
        try testDecodedHistoryItemCannotRepresentContent()
        try testNewAppendPersistsMetadataOnly()
        try testUpdateStripsExistingContentBearingColumns()
        try testLoadStripsLegacyContentBearingColumns()
        try testExporterRemainsMetadataOnlyForLoadedLegacyRows()
        try testSanitizerRemovesLegacyUploadContentAndContextMetadata()
        print("PipelineHistoryPrivacyTests passed")
    }

    private static func testDecodedHistoryItemCannotRepresentContent() throws {
        let item = try JSONDecoder().decode(PipelineHistoryItem.self, from: legacyContentBearingJSON(id: UUID()))

        expectMetadataOnly(item, "decoded history item")
    }

    private static func testNewAppendPersistsMetadataOnly() throws {
        try resetStore()
        let item = PipelineHistoryItem(
            intent: .commandAutomatic,
            timestamp: Date(timeIntervalSince1970: 1_800_000_000),
            contextScreenshotStatus: "available",
            postProcessingStatus: "RubyWhisper upload succeeded",
            debugStatus: "Uploading audio",
            timingSummary: safeTimingSummary
        )

        _ = try store.append(item, maxCount: 10)
        let loaded = store.loadAllHistory()

        expect(loaded.count == 1, "new append should preserve one metadata row")
        expectMetadataOnly(loaded[0], "new append")
        expect(loaded[0].intent == .commandAutomatic, "new append should keep intent metadata")
        expect(loaded[0].postProcessingStatus == "RubyWhisper upload succeeded", "new append should keep status metadata")
        expect(loaded[0].debugStatus == "Uploading audio", "new append should keep debug status metadata")
        expect(loaded[0].timingSummary == safeTimingSummary, "new append should keep timing metadata")
    }

    private static func testUpdateStripsExistingContentBearingColumns() throws {
        try resetStore()
        let id = UUID()
        let original = metadataItem(id: id, timestamp: Date(timeIntervalSince1970: 1_800_000_001))
        try store.insertLegacyUnsafeContentForPrivacyTest(original, forbiddenValue: forbiddenValue)

        let update = PipelineHistoryItem(
            intent: .commandManual,
            id: id,
            timestamp: Date(timeIntervalSince1970: 1_800_000_002),
            contextScreenshotStatus: "No screenshot",
            postProcessingStatus: "Upload failed: network_error",
            debugStatus: "Done",
            timingSummary: "stop_to_audio_ms=25 upload_response_ms=900 status=network_error"
        )
        try store.update(update)

        let loaded = store.loadAllHistory()
        expect(loaded.count == 1, "update should preserve the existing row")
        expectMetadataOnly(loaded[0], "update")
        expect(loaded[0].intent == .commandManual, "update should keep updated intent metadata")
        expect(loaded[0].postProcessingStatus == "Upload failed: network_error", "update should keep status metadata")
        expect(loaded[0].debugStatus == "Done", "update should keep debug status metadata")
        expect(loaded[0].timingSummary == "stop_to_audio_ms=25 upload_response_ms=900 status=network_error", "update should keep timing metadata")
    }

    private static func testLoadStripsLegacyContentBearingColumns() throws {
        try resetStore()
        try store.insertLegacyUnsafeContentForPrivacyTest(
            metadataItem(id: UUID(), timestamp: Date(timeIntervalSince1970: 1_800_000_003)),
            forbiddenValue: forbiddenValue
        )

        let loaded = store.loadAllHistory()

        expect(loaded.count == 1, "load should preserve the legacy metadata row")
        expectMetadataOnly(loaded[0], "legacy load")
    }

    private static func testExporterRemainsMetadataOnlyForLoadedLegacyRows() throws {
        try resetStore()
        try store.insertLegacyUnsafeContentForPrivacyTest(
            metadataItem(id: UUID(), timestamp: Date(timeIntervalSince1970: 1_800_000_004)),
            forbiddenValue: forbiddenValue
        )
        let item = try requireOne(store.loadAllHistory(), "export legacy load")
        let jsonData = try TestCaseExporter.metadataJSONData(
            for: item,
            exportedAt: Date(timeIntervalSince1970: 1_800_000_005)
        )
        let jsonText = String(decoding: jsonData, as: UTF8.self)
        let json = try requireDictionary(JSONSerialization.jsonObject(with: jsonData))
        let pipeline = try requireDictionary(json["pipeline"])

        expect(!jsonText.contains(forbiddenValue), "export JSON should not contain legacy forbidden content")
        expect(json["metadata"] == nil, "export JSON should not include private app or bundle metadata")
        expect(pipeline["has_audio_artifact"] as? Bool == false, "export JSON should not report audio payloads")
        expect(pipeline["has_source_text_payload"] as? Bool == false, "export JSON should not report raw transcript payloads")
        expect(pipeline["has_final_text_payload"] as? Bool == false, "export JSON should not report cleaned text payloads")
        expect(pipeline["has_context_payload"] as? Bool == false, "export JSON should not report context payloads")
        expect(pipeline["has_post_processing_prompt"] as? Bool == false, "export JSON should not report prompt payloads")
        expect(pipeline["timing_summary"] as? String == safeTimingSummary, "export JSON may include safe timing metadata")
    }

    private static func testSanitizerRemovesLegacyUploadContentAndContextMetadata() throws {
        try resetStore()
        try store.insertLegacyUnsafeContentForPrivacyTest(
            metadataItem(id: UUID(), timestamp: Date(timeIntervalSince1970: 1_800_000_006)),
            forbiddenValue: forbiddenValue
        )

        let removedAudioFileNames = try store.sanitizePersistedContentReferences()
        let sanitized = store.loadAllHistory()

        expect(removedAudioFileNames == [forbiddenValue], "sanitizer should return legacy audio references for cleanup")
        expect(sanitized.count == 1, "sanitizer should preserve the metadata-only history row")
        expectMetadataOnly(sanitized[0], "startup sanitizer")
        expect(sanitized[0].postProcessingStatus == "RubyWhisper upload succeeded", "sanitizer may keep status metadata")
        expect(sanitized[0].debugStatus == "Uploading audio", "sanitizer may keep lifecycle metadata")
        expect(sanitized[0].timingSummary == safeTimingSummary, "sanitizer may keep timing metadata")
    }

    private static func metadataItem(id: UUID, timestamp: Date) -> PipelineHistoryItem {
        PipelineHistoryItem(
            id: id,
            timestamp: timestamp,
            contextScreenshotStatus: "available",
            postProcessingStatus: "RubyWhisper upload succeeded",
            debugStatus: "Uploading audio",
            timingSummary: safeTimingSummary
        )
    }

    private static func resetStore() throws {
        _ = try store.clearAll()
    }

    private static func legacyContentBearingJSON(id: UUID) -> Data {
        Data("""
        {
          "intent": "dictation",
          "id": "\(id.uuidString)",
          "timestamp": 1800000000,
          "rawTranscript": "\(forbiddenValue)",
          "postProcessedTranscript": "\(forbiddenValue)",
          "postProcessingPrompt": "\(forbiddenValue)",
          "systemPrompt": "\(forbiddenValue)",
          "contextSummary": "\(forbiddenValue)",
          "contextSystemPrompt": "\(forbiddenValue)",
          "contextPrompt": "\(forbiddenValue)",
          "contextScreenshotDataURL": "\(forbiddenValue)",
          "contextScreenshotStatus": "available",
          "postProcessingStatus": "RubyWhisper upload succeeded",
          "debugStatus": "Uploading audio",
          "timingSummary": "\(forbiddenValue)",
          "customVocabulary": "\(forbiddenValue)",
          "audioFileName": "\(forbiddenValue)",
          "contextAppName": "\(forbiddenValue)",
          "contextBundleIdentifier": "\(forbiddenValue)",
          "contextWindowTitle": "\(forbiddenValue)",
          "selectedText": "\(forbiddenValue)",
          "capturedSelection": "\(forbiddenValue)"
        }
        """.utf8)
    }

    private static func expectMetadataOnly(_ item: PipelineHistoryItem, _ label: String) {
        expect(item.selectedText == nil, "\(label) should not expose selected text")
        expect(item.capturedSelection == nil, "\(label) should not expose captured selection")
        expect(item.rawTranscript.isEmpty, "\(label) should not expose raw transcript")
        expect(item.postProcessedTranscript.isEmpty, "\(label) should not expose cleaned transcript")
        expect(item.postProcessingPrompt == nil, "\(label) should not expose post-processing prompt")
        expect(item.systemPrompt == nil, "\(label) should not expose system prompt")
        expect(item.contextSummary.isEmpty, "\(label) should not expose context summary")
        expect(item.contextSystemPrompt == nil, "\(label) should not expose context system prompt")
        expect(item.contextPrompt == nil, "\(label) should not expose context prompt")
        expect(item.contextScreenshotDataURL == nil, "\(label) should not expose screenshot data")
        expect(item.customVocabulary.isEmpty, "\(label) should not expose dictionary terms")
        expect(item.audioFileName == nil, "\(label) should not expose audio file references")
        expect(item.contextAppName == nil, "\(label) should not expose app name")
        expect(item.contextBundleIdentifier == nil, "\(label) should not expose bundle identifier")
        expect(item.contextWindowTitle == nil, "\(label) should not expose window title")
        expect(!item.timingSummary.contains(forbiddenValue), "\(label) should not expose unsafe timing metadata")
    }

    private static func requireOne(_ items: [PipelineHistoryItem], _ label: String) throws -> PipelineHistoryItem {
        expect(items.count == 1, "\(label) should produce exactly one row")
        return items[0]
    }

    private static func requireDictionary(_ value: Any?) throws -> [String: Any] {
        guard let dictionary = value as? [String: Any] else {
            throw TestFailure("Expected dictionary")
        }
        return dictionary
    }
}

private struct TestFailure: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}
