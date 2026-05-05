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
    static func main() throws {
        try testSanitizerRemovesUploadContentAndContextMetadata()
        print("PipelineHistoryPrivacyTests passed")
    }

    private static func testSanitizerRemovesUploadContentAndContextMetadata() throws {
        let store = PipelineHistoryStore(storeURL: nil, inMemory: true)
        let item = PipelineHistoryItem(
            timestamp: Date(timeIntervalSince1970: 1_800_000_000),
            rawTranscript: "raw_transcript_placeholder_private",
            postProcessedTranscript: "cleaned_transcript_placeholder_private",
            postProcessingPrompt: "prompt_placeholder_private",
            systemPrompt: "system_prompt_placeholder_private",
            contextSummary: "context_summary_placeholder_private",
            contextSystemPrompt: "context_system_prompt_placeholder_private",
            contextPrompt: "context_prompt_placeholder_private",
            contextScreenshotDataURL: "data:image/png;base64,placeholder_private",
            contextScreenshotStatus: "available",
            postProcessingStatus: "RubyWhisper upload succeeded",
            debugStatus: "Uploading audio",
            customVocabulary: "term_placeholder_private",
            audioFileName: "audio_placeholder_private.wav",
            contextAppName: "Private App",
            contextBundleIdentifier: "com.example.private",
            contextWindowTitle: "Private Window"
        )

        _ = try store.append(item, maxCount: 10)
        let removedAudioFileNames = try store.sanitizePersistedContentReferences()
        let sanitized = store.loadAllHistory()

        expect(removedAudioFileNames.isEmpty, "new history rows should not persist audio references")
        expect(sanitized.count == 1, "sanitizer should preserve the metadata-only history row")

        let sanitizedItem = sanitized[0]
        expect(sanitizedItem.rawTranscript.isEmpty, "sanitizer should remove raw transcript")
        expect(sanitizedItem.postProcessedTranscript.isEmpty, "sanitizer should remove cleaned transcript from history")
        expect(sanitizedItem.postProcessingPrompt == nil, "sanitizer should remove post-processing prompt")
        expect(sanitizedItem.systemPrompt == nil, "sanitizer should remove system prompt")
        expect(sanitizedItem.contextSummary.isEmpty, "sanitizer should remove context summary")
        expect(sanitizedItem.contextSystemPrompt == nil, "sanitizer should remove context system prompt")
        expect(sanitizedItem.contextPrompt == nil, "sanitizer should remove context prompt")
        expect(sanitizedItem.contextScreenshotDataURL == nil, "sanitizer should remove context screenshot data")
        expect(sanitizedItem.customVocabulary.isEmpty, "sanitizer should remove dictionary terms")
        expect(sanitizedItem.audioFileName == nil, "sanitizer should remove audio file reference")
        expect(sanitizedItem.contextAppName == nil, "sanitizer should remove context app name")
        expect(sanitizedItem.contextBundleIdentifier == nil, "sanitizer should remove context bundle identifier")
        expect(sanitizedItem.contextWindowTitle == nil, "sanitizer should remove context window title")
        expect(sanitizedItem.postProcessingStatus == "RubyWhisper upload succeeded", "sanitizer may keep categorical processing status")
        expect(sanitizedItem.debugStatus == "Uploading audio", "sanitizer may keep content-free lifecycle status")
    }
}
