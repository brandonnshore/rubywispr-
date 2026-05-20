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
private struct OpenAIRealtimeTranscriptionSessionTests {
    static func main() {
        testEventParsing()
        testBillableWordCount()
        testRecoveryDecision()
        testRealtimeSessionDiagnosticsRedactClientSecret()
        print("OpenAIRealtimeTranscriptionSessionTests passed")
    }

    private static func testEventParsing() {
        let completed = OpenAIRealtimeTranscriptionEvent.parse("""
        {
          "type": "conversation.item.input_audio_transcription.completed",
          "transcript": "  Synthetic final transcript.  "
        }
        """)
        let delta = OpenAIRealtimeTranscriptionEvent.parse("""
        {
          "type": "conversation.item.input_audio_transcription.delta",
          "delta": "Synthetic"
        }
        """)
        let providerError = OpenAIRealtimeTranscriptionEvent.parse("""
        {
          "type": "error",
          "error": { "message": "payload must not echo" }
        }
        """)

        expect(
            completed?.completedTranscript == "Synthetic final transcript.",
            "completed events should expose a trimmed final transcript"
        )
        expect(delta?.delta == "Synthetic", "delta events should decode incremental text")
        expect(delta?.completedTranscript == nil, "delta events should not masquerade as final text")
        expect(providerError?.isProviderError == true, "error events should be classified")
        expect(OpenAIRealtimeTranscriptionEvent.parse("{") == nil, "invalid events should be ignored")
    }

    private static func testBillableWordCount() {
        expect(
            OpenAIRealtimeTranscriptionSession.billableWordCount(in: "Hello, world. Don't stop 42.") == 5,
            "word count should count words, contractions, and numbers"
        )
        expect(
            OpenAIRealtimeTranscriptionSession.billableWordCount(in: "   ") == 0,
            "blank transcripts should not count words"
        )
    }

    private static func testRecoveryDecision() {
        expect(
            OpenAIRealtimeTranscriptionRecoveryDecision.evaluate(
                error: OpenAIRealtimeTranscriptionError.providerError
            ) == .batchFallback,
            "provider failures should fall back to batch transcription"
        )
        expect(
            OpenAIRealtimeTranscriptionRecoveryDecision.evaluate(error: CancellationError()) == .cancel,
            "task cancellation should not trigger fallback upload"
        )
    }

    private static func testRealtimeSessionDiagnosticsRedactClientSecret() {
        let session = RubyWhisperDesktopRealtimeTranscriptionSession(
            ok: true,
            requestId: "req_rw_synthetic_realtime_001",
            provider: "openai_realtime",
            clientSecret: "ek_synthetic_realtime_client_secret",
            expiresAt: 1779240000,
            webSocketURL: "wss://openai-realtime-provider.test/realtime",
            trialWordsRemaining: 3900,
            trialWordsUsed: 1100,
            trialWordsLimit: 5000,
            planState: .trialActive,
            providerLatencyMs: 82
        )
        let summary = session.redactedDiagnosticSummary()

        expect(summary["clientSecret"] == "<redacted>", "client secret should be redacted")
        expect(
            !summary.description.contains("ek_synthetic_realtime_client_secret"),
            "diagnostics should not contain the client secret value"
        )
        expect(summary["provider"] == "openai_realtime", "metadata provider should be retained")
    }
}
