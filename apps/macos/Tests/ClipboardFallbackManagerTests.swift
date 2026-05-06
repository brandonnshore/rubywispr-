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

private final class FixturePasteboardPort: ClipboardFallbackPasteboardPort {
    var changeCount = 10
    var snapshotResult: ClipboardFallbackSnapshotResult = .supported(.empty)
    var writeShouldSucceed = true
    var restoreShouldSucceed = true
    var ownsFallback = true
    private(set) var captureCallCount = 0
    private(set) var restoreCallCount = 0
    private(set) var writtenTexts: [String] = []
    private(set) var ownerTokens: [UUID] = []
    private(set) var expectedOwnershipChecks: [(ownerToken: UUID, expectedChangeCount: Int)] = []

    func captureSupportedSnapshot() -> ClipboardFallbackSnapshotResult {
        captureCallCount += 1
        return snapshotResult
    }

    func writeFallbackText(_ text: String, ownerToken: UUID) -> Int? {
        guard writeShouldSucceed else { return nil }
        writtenTexts.append(text)
        ownerTokens.append(ownerToken)
        changeCount += 1
        return changeCount
    }

    func ownsFallbackText(ownerToken: UUID, expectedChangeCount: Int) -> Bool {
        expectedOwnershipChecks.append((ownerToken, expectedChangeCount))
        return ownsFallback && ownerTokens.last == ownerToken && changeCount == expectedChangeCount
    }

    func restore(_ snapshot: ClipboardFallbackSnapshot) -> Bool {
        _ = snapshot
        restoreCallCount += 1
        return restoreShouldSucceed
    }
}

private final class FixtureScheduler: ClipboardFallbackRestorationScheduler {
    private(set) var delays: [TimeInterval] = []
    private var actions: [() -> Void] = []

    func scheduleRestoration(after delay: TimeInterval, _ action: @escaping () -> Void) {
        delays.append(delay)
        actions.append(action)
    }

    func runScheduled() {
        let pending = actions
        actions.removeAll()
        for action in pending {
            action()
        }
    }
}

private final class FixtureEventSink: ClipboardFallbackEventSink {
    private(set) var events: [ClipboardFallbackEvent] = []

    func record(_ event: ClipboardFallbackEvent) {
        events.append(event)
    }
}

@main
private struct ClipboardFallbackManagerTests {
    static func main() throws {
        testSupportedSnapshotRestoresOnlyWhileOwned()
        testOwnershipChangedSkipsRestore()
        testUnsupportedSnapshotCopiesAndSkipsRestore()
        testDisabledRestorationDoesNotSnapshot()
        testWriteFailureDoesNotScheduleRestore()
        try testCopySuccessEventsDoNotExposeClipboardFallbackPayloads()
        try testWriteFailureEventsDoNotExposeClipboardFallbackPayloads()

        print("ClipboardFallbackManagerTests passed")
    }

    private static func testSupportedSnapshotRestoresOnlyWhileOwned() {
        let pasteboard = FixturePasteboardPort()
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "  cleaned_text_placeholder_success  ",
            reason: .automaticFallback,
            restorePreviousClipboard: true
        )

        guard case .copied(.pending(let ownerToken, let expectedChangeCount)) = result else {
            expect(false, "supported snapshot should return pending restoration")
            return
        }

        expect(pasteboard.writtenTexts == ["cleaned_text_placeholder_success"], "fallback should write only trimmed cleaned text")
        expect(pasteboard.ownerTokens == [ownerToken], "pending restoration should expose the write owner token")
        expect(expectedChangeCount == pasteboard.changeCount, "pending restoration should expose the write change count")
        expect(scheduler.delays == [0.25], "supported snapshot should schedule one bounded restore")
        expect(sink.events == [
            ClipboardFallbackEvent(
                state: .fallbackCopied,
                reason: .automaticFallback,
                snapshotStatus: .supported,
                skipReason: nil
            ),
        ], "copy event should be categorical and content-free")

        scheduler.runScheduled()

        expect(pasteboard.expectedOwnershipChecks.count == 1, "restore should check ownership before writing previous snapshot")
        expect(pasteboard.expectedOwnershipChecks[0].ownerToken == ownerToken, "ownership check should use owner token")
        expect(pasteboard.expectedOwnershipChecks[0].expectedChangeCount == expectedChangeCount, "ownership check should use change count")
        expect(pasteboard.restoreCallCount == 1, "owned fallback should restore supported snapshot")
        expect(sink.events.last == ClipboardFallbackEvent(
            state: .clipboardRestored,
            reason: .automaticFallback,
            snapshotStatus: .supported,
            skipReason: nil
        ), "restore event should be categorical")
    }

    private static func testOwnershipChangedSkipsRestore() {
        let pasteboard = FixturePasteboardPort()
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "cleaned_text_placeholder_ownership",
            reason: .automaticFallback,
            restorePreviousClipboard: true
        )
        guard case .copied(.pending) = result else {
            expect(false, "supported snapshot should schedule ownership-checked restore")
            return
        }

        pasteboard.changeCount += 1
        scheduler.runScheduled()

        expect(pasteboard.restoreCallCount == 0, "changed ownership must skip prior clipboard restoration")
        expect(sink.events.last == ClipboardFallbackEvent(
            state: .clipboardRestoreSkipped,
            reason: .automaticFallback,
            snapshotStatus: .supported,
            skipReason: .ownershipChanged
        ), "ownership changed should map to restoration skipped")
    }

    private static func testUnsupportedSnapshotCopiesAndSkipsRestore() {
        let pasteboard = FixturePasteboardPort()
        pasteboard.snapshotResult = .unsupported
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "cleaned_text_placeholder_unsupported",
            reason: .automaticFallback,
            restorePreviousClipboard: true
        )

        expect(result == .copied(restoration: .skipped(.unsupportedData)), "unsupported data should skip restoration")
        expect(pasteboard.writtenTexts == ["cleaned_text_placeholder_unsupported"], "unsupported snapshot should not block fallback copy")
        expect(scheduler.delays.isEmpty, "unsupported snapshot should not schedule restore")
        expect(pasteboard.restoreCallCount == 0, "unsupported snapshot must not restore")
        expect(sink.events.map(\.state) == [.fallbackCopied, .clipboardRestoreSkipped], "unsupported snapshot should emit copied then skipped states")
        expect(sink.events.last?.skipReason == .unsupportedData, "unsupported data should use categorical skip reason")
    }

    private static func testDisabledRestorationDoesNotSnapshot() {
        let pasteboard = FixturePasteboardPort()
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "cleaned_text_placeholder_manual",
            reason: .manualCopyRecovery,
            restorePreviousClipboard: false
        )

        expect(result == .copied(restoration: .skipped(.restorationDisabled)), "disabled restoration should be explicit")
        expect(pasteboard.captureCallCount == 0, "disabled restoration must not read prior clipboard snapshot")
        expect(pasteboard.writtenTexts == ["cleaned_text_placeholder_manual"], "manual copy should write only selected cleaned text")
        expect(scheduler.delays.isEmpty, "disabled restoration should not schedule restore")
        expect(sink.events == [
            ClipboardFallbackEvent(
                state: .manualCopyRecovery,
                reason: .manualCopyRecovery,
                snapshotStatus: .disabled,
                skipReason: nil
            ),
            ClipboardFallbackEvent(
                state: .clipboardRestoreSkipped,
                reason: .manualCopyRecovery,
                snapshotStatus: .disabled,
                skipReason: .restorationDisabled
            ),
        ], "manual copy recovery should emit categorical disabled-restoration events")
    }

    private static func testWriteFailureDoesNotScheduleRestore() {
        let pasteboard = FixturePasteboardPort()
        pasteboard.writeShouldSucceed = false
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "cleaned_text_placeholder_write_failure",
            reason: .automaticFallback,
            restorePreviousClipboard: true
        )

        expect(result == .writeFailed, "write failure should surface without claiming copy")
        expect(scheduler.delays.isEmpty, "write failure should not schedule restoration")
        expect(pasteboard.restoreCallCount == 0, "write failure should not restore")
        expect(sink.events == [
            ClipboardFallbackEvent(
                state: .clipboardRestoreSkipped,
                reason: .automaticFallback,
                snapshotStatus: .supported,
                skipReason: .writeFailed
            ),
        ], "write failure should emit categorical skip event")
    }

    private static func testCopySuccessEventsDoNotExposeClipboardFallbackPayloads() throws {
        let pasteboard = FixturePasteboardPort()
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "clipboard_fallback_text_placeholder_private",
            reason: .automaticFallback,
            restorePreviousClipboard: true
        )

        guard case .copied(.pending) = result else {
            expect(false, "copy success should schedule restoration for privacy inspection")
            return
        }

        scheduler.runScheduled()

        let eventSurface = try encodedEventSurface(sink.events)
        expect(eventSurface.contains("fallback_copied"), "event surface should include categorical copied state")
        expect(eventSurface.contains("clipboard_restored"), "event surface should include categorical restoration state")
        assertNoForbiddenPrivacyPayloads(eventSurface)
    }

    private static func testWriteFailureEventsDoNotExposeClipboardFallbackPayloads() throws {
        let pasteboard = FixturePasteboardPort()
        pasteboard.writeShouldSucceed = false
        let scheduler = FixtureScheduler()
        let sink = FixtureEventSink()
        let manager = makeManager(pasteboard: pasteboard, scheduler: scheduler, sink: sink)

        let result = manager.copyCleanedText(
            "clipboard_fallback_text_placeholder_write_failed",
            reason: .automaticFallback,
            restorePreviousClipboard: true
        )

        expect(result == .writeFailed, "write failure should remain inspectable without copy success")

        let eventSurface = try encodedEventSurface(sink.events)
        expect(eventSurface.contains("clipboard_restore_skipped"), "event surface should include categorical skip state")
        expect(eventSurface.contains("write_failed"), "event surface should include categorical write failure")
        assertNoForbiddenPrivacyPayloads(eventSurface)
    }

    private static func makeManager(
        pasteboard: FixturePasteboardPort,
        scheduler: FixtureScheduler,
        sink: FixtureEventSink
    ) -> ClipboardFallbackManager {
        ClipboardFallbackManager(
            pasteboard: pasteboard,
            scheduler: scheduler,
            eventSink: sink,
            restoreDelay: 0.25
        )
    }

    private static func encodedEventSurface(_ events: [ClipboardFallbackEvent]) throws -> String {
        let encoded = try JSONEncoder().encode(events)
        return String(data: encoded, encoding: .utf8) ?? ""
    }

    private static func assertNoForbiddenPrivacyPayloads(_ surface: String) {
        for forbidden in [
            "clipboard_fallback_text_placeholder_private",
            "clipboard_fallback_text_placeholder_write_failed",
            "previous_clipboard_placeholder_private",
            "local_history_placeholder_private",
            "audio_payload_placeholder_private",
            "raw_transcript_placeholder_private",
            "app_context_placeholder_private",
            "selected_text_placeholder_private",
            "window_title_placeholder_private",
            "bundle_identifier_placeholder_private",
            "provider_payload_placeholder_private",
        ] {
            expect(!surface.localizedCaseInsensitiveContains(forbidden), "clipboard fallback event surface should not include \(forbidden)")
        }
    }
}
