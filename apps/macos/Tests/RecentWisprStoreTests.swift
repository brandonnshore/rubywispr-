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

private final class FixtureIDs {
    private var counter = 0

    func next() -> String {
        counter += 1
        return String(format: "recent_wispr_id_%03d", counter)
    }
}

private final class FixtureClock {
    private var current: Date

    init(_ timestamp: TimeInterval = 1_800_000_000) {
        self.current = Date(timeIntervalSince1970: timestamp)
    }

    func now() -> Date {
        current
    }

    func advance(seconds: TimeInterval) {
        current = current.addingTimeInterval(seconds)
    }
}

private func makeDefaults(_ suffix: String) -> UserDefaults {
    let suiteName = "com.rubywhisper.recent-wisprs.tests.\(suffix).\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
        FileHandle.standardError.write(Data("FAIL: could not create test defaults\n".utf8))
        exit(1)
    }
    defaults.removePersistentDomain(forName: suiteName)
    return defaults
}

private func makeStore(
    defaults: UserDefaults,
    ids: FixtureIDs = FixtureIDs(),
    clock: FixtureClock = FixtureClock()
) -> RecentWisprStore {
    RecentWisprStore(
        persistence: defaults,
        storageKey: "recent_wisprs_test",
        idProvider: { ids.next() },
        dateProvider: { clock.now() }
    )
}

@main
private struct RecentWisprStoreTests {
    static func main() throws {
        try testDefaultStateAndRecordStatuses()
        try testSevenDayRetentionExpiresWithoutWaiting()
        try testClearAndDisabledHistoryFlows()
        try testReloadAndCopiedMetadata()
        try testCorruptedStateDefaultsClosed()
        try testPersistedPrivacyShape()
        try testPersistedForbiddenFieldsAreScrubbedOnLoad()

        print("RecentWisprStoreTests passed")
    }

    private static func testDefaultStateAndRecordStatuses() throws {
        let defaults = makeDefaults("record-statuses")
        let ids = FixtureIDs()
        let clock = FixtureClock()
        let store = makeStore(defaults: defaults, ids: ids, clock: clock)

        expect(store.isHistoryEnabled, "recent wisprs should default to enabled")
        expect(store.listItems().isEmpty, "recent wisprs should default to empty")

        let inserted = store.recordFinalText(
            "  final_text_placeholder_inserted  ",
            insertionStatus: .inserted
        )
        clock.advance(seconds: 60)
        let failed = store.recordFinalText(
            "final_text_placeholder_failed",
            insertionStatus: .insertionFailed,
            destinationAppCategory: " plain_text_editor "
        )

        let items = store.listItems()
        expect(inserted?.id == "recent_wispr_id_001", "first item should use deterministic local id")
        expect(failed?.id == "recent_wispr_id_002", "second item should use deterministic local id")
        expect(items.map(\.id) == ["recent_wispr_id_002", "recent_wispr_id_001"], "items should list newest first")
        expect(items[0].insertionStatus == .insertionFailed, "failed insertion status should persist")
        expect(items[0].destinationAppCategory == "plain_text_editor", "destination category should be normalized")
        expect(items[1].insertionStatus == .inserted, "inserted status should persist")
        expect(items[1].finalText == "final_text_placeholder_inserted", "final text should be trimmed for local recovery")
        expect(
            items[1].expiresAt.timeIntervalSince(items[1].createdAt) == RecentWisprStore.defaultRetentionSeconds,
            "default retention should be exactly seven days"
        )
    }

    private static func testSevenDayRetentionExpiresWithoutWaiting() throws {
        let defaults = makeDefaults("retention")
        let ids = FixtureIDs()
        let clock = FixtureClock()
        let store = makeStore(defaults: defaults, ids: ids, clock: clock)

        _ = store.recordFinalText("final_text_placeholder_old", insertionStatus: .inserted)
        clock.advance(seconds: RecentWisprStore.defaultRetentionSeconds - 1)
        _ = store.recordFinalText("final_text_placeholder_new", insertionStatus: .inserted)

        expect(store.listItems().count == 2, "item should remain until its exact expiry instant")

        clock.advance(seconds: 1)
        let removed = store.cleanupExpiredItems()
        let remaining = store.listItems()

        expect(removed == 1, "cleanup should remove entries expiring at cleanup time")
        expect(remaining.map(\.finalText) == ["final_text_placeholder_new"], "newer entry should remain")

        let reloaded = makeStore(defaults: defaults, ids: ids, clock: clock)
        expect(reloaded.listItems().map(\.finalText) == ["final_text_placeholder_new"], "expired entries should stay removed after reload")
    }

    private static func testClearAndDisabledHistoryFlows() throws {
        let defaults = makeDefaults("disabled")
        let ids = FixtureIDs()
        let clock = FixtureClock()
        let store = makeStore(defaults: defaults, ids: ids, clock: clock)

        _ = store.recordFinalText("final_text_placeholder_before_clear", insertionStatus: .inserted)
        store.clearHistory()
        expect(store.listItems().isEmpty, "clear history should remove all local recent wisprs")

        store.setHistoryEnabled(false)
        let disabledWrite = store.recordFinalText(
            "final_text_placeholder_should_not_persist",
            insertionStatus: .insertionFailed
        )
        expect(disabledWrite == nil, "disabled history should avoid new writes")
        expect(store.listItems().isEmpty, "disabled history should not persist final text")

        store.setHistoryEnabled(true)
        _ = store.recordFinalText("final_text_placeholder_after_reenable", insertionStatus: .inserted)
        expect(store.listItems().count == 1, "reenabled history should allow future writes")

        store.disableAndClearHistory()
        expect(!store.isHistoryEnabled, "disable and clear should disable future writes")
        expect(store.listItems().isEmpty, "disable and clear should remove existing entries")
    }

    private static func testReloadAndCopiedMetadata() throws {
        let defaults = makeDefaults("reload-copy")
        let ids = FixtureIDs()
        let clock = FixtureClock()
        let store = makeStore(defaults: defaults, ids: ids, clock: clock)

        let item = store.recordFinalText("final_text_placeholder_copy", insertionStatus: .inserted)
        clock.advance(seconds: 30)
        let copied = store.markCopied(id: item?.id ?? "")

        expect(copied?.copiedAt == clock.now(), "copy metadata should use deterministic clock")

        let reloaded = makeStore(defaults: defaults, ids: ids, clock: clock)
        let items = reloaded.listItems()
        expect(items.count == 1, "recent wisprs should persist across reload")
        expect(items[0].copiedAt == clock.now(), "copied metadata should persist across reload")
    }

    private static func testCorruptedStateDefaultsClosed() throws {
        let defaults = makeDefaults("corrupted")
        defaults.set(Data("not-json".utf8), forKey: "recent_wisprs_test")

        let store = makeStore(defaults: defaults)

        expect(store.isHistoryEnabled, "corrupted recent wisprs state should default to enabled")
        expect(store.listItems().isEmpty, "corrupted recent wisprs state should fail closed to empty")
        expect(defaults.data(forKey: "recent_wisprs_test") == nil, "corrupted recent wisprs state should be cleared")
    }

    private static func testPersistedPrivacyShape() throws {
        let defaults = makeDefaults("privacy-shape")
        let store = makeStore(defaults: defaults)

        _ = store.recordFinalText("final_text_placeholder_privacy", insertionStatus: .inserted)

        guard let data = defaults.data(forKey: "recent_wisprs_test"),
              let persisted = String(data: data, encoding: .utf8) else {
            expect(false, "recent wisprs should persist JSON snapshot")
            return
        }

        expect(persisted.contains("\"finalText\""), "snapshot should include final text field")
        expect(persisted.contains("\"createdAt\""), "snapshot should include creation timestamp")
        expect(persisted.contains("\"expiresAt\""), "snapshot should include expiry timestamp")
        expect(persisted.contains("\"insertionStatus\""), "snapshot should include insertion status")
        expect(persisted.contains("\"source\""), "snapshot should include local source metadata")

        for forbidden in [
            "rawTranscript",
            "audio",
            "prompt",
            "context",
            "clipboard",
            "selectedText",
            "destinationAppText",
            "supabase",
            "provider",
        ] {
            expect(!persisted.localizedCaseInsensitiveContains(forbidden), "snapshot should not include \(forbidden)")
        }
    }

    private static func testPersistedForbiddenFieldsAreScrubbedOnLoad() throws {
        let defaults = makeDefaults("scrub-forbidden-fields")
        let key = "recent_wisprs_test"

        defaults.set(Data("""
        {
          "isHistoryEnabled": true,
          "items": [
            {
              "audioFileName": "audio_placeholder_forbidden.wav",
              "clipboard": "clipboard_placeholder_forbidden",
              "context": "context_placeholder_forbidden",
              "createdAt": "2027-01-15T00:00:00Z",
              "destinationAppCategory": "notes",
              "expiresAt": "2027-01-22T00:00:00Z",
              "finalText": "SYNTHETIC_RECENT_WISPR_TEXT",
              "id": "recent_wispr_id_forbidden_load",
              "insertionStatus": "inserted",
              "providerRequestBody": "provider_payload_placeholder_forbidden",
              "rawTranscript": "raw_transcript_placeholder_forbidden",
              "source": "dictation"
            }
          ],
          "serverHistoryId": "server_history_placeholder_forbidden"
        }
        """.utf8), forKey: key)

        let store = RecentWisprStore(
            persistence: defaults,
            storageKey: key,
            dateProvider: { Date(timeIntervalSince1970: 1_800_000_000) }
        )
        let items = store.listItems()

        expect(items.count == 1, "valid local-only item should survive forbidden-field scrubbing")
        expect(items[0].finalText == "SYNTHETIC_RECENT_WISPR_TEXT", "allowed final text should remain local")
        expect(items[0].destinationAppCategory == "notes", "allowed destination category should remain")

        guard let scrubbedData = defaults.data(forKey: key),
              let scrubbed = String(data: scrubbedData, encoding: .utf8) else {
            expect(false, "loaded recent wisprs snapshot should be rewritten")
            return
        }

        expect(scrubbed.contains("\"finalText\""), "scrubbed snapshot should keep the approved final text field")
        for forbidden in [
            "audioFileName",
            "audio_placeholder_forbidden",
            "clipboard",
            "clipboard_placeholder_forbidden",
            "context_placeholder_forbidden",
            "providerRequestBody",
            "provider_payload_placeholder_forbidden",
            "rawTranscript",
            "raw_transcript_placeholder_forbidden",
            "serverHistoryId",
            "server_history_placeholder_forbidden",
        ] {
            expect(!scrubbed.localizedCaseInsensitiveContains(forbidden), "loaded snapshot should scrub \(forbidden)")
        }
    }
}
