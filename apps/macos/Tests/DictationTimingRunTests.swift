import Foundation

@main
struct DictationTimingRunTests {
    static func main() {
        testSummaryUsesOnlySafeTimingFields()
        testStatusIsNormalized()
        print("DictationTimingRunTests passed")
    }

    private static func testSummaryUsesOnlySafeTimingFields() {
        var run = DictationTimingRun()
        run.markStopRequested(nowMs: 100)
        run.markArtifactReady(nowMs: 130)
        run.markContextSkipped(reason: "fast dictation with private app name", nowMs: 135)
        run.markUploadStarted(nowMs: 140)
        run.markBackendResponse(nowMs: 620)
        run.markInsertionStarted(nowMs: 640)
        run.markInsertionFinished(outcome: "direct insertion succeeded", nowMs: 710)

        let summary = run.safeSummary
        expect(summary.contains("stop_to_audio_ms=30"), "summary should include stop-to-audio timing")
        expect(summary.contains("context_wait_ms=0"), "summary should include zero context wait when skipped")
        expect(summary.contains("upload_response_ms=480"), "summary should include upload response timing")
        expect(summary.contains("response_to_insert_ms=20"), "summary should include response-to-insertion timing")
        expect(summary.contains("insertion_ms=70"), "summary should include insertion timing")
        expect(summary.contains("total_stop_to_terminal_ms=610"), "summary should include total timing")
        expect(summary.contains("context=fast_dictation_with_private_app_name"), "summary should normalize context status")
        expect(summary.contains("status=direct_insertion_succeeded"), "summary should normalize terminal status")
        expect(!summary.contains("@"), "summary should not preserve arbitrary punctuation")
        expect(!summary.contains("private app name"), "summary should not keep raw status text with spaces")
    }

    private static func testStatusIsNormalized() {
        var run = DictationTimingRun()
        run.markStopRequested(nowMs: 1)
        run.markTerminalStatus("Provider failed: secret-ish text?!")

        let summary = run.safeSummary
        expect(summary.contains("status=provider_failed:_secret-ish_text"), "status should be normalized and bounded")
        expect(!summary.contains("?!"), "status should strip unsupported punctuation")
    }

    private static func expect(_ condition: Bool, _ message: String) {
        guard condition else {
            fatalError(message)
        }
    }
}
