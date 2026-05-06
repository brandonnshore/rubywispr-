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
private struct RecentWisprsHistoryMenuStateTests {
    static func main() {
        testEmptyEnabledStateExplainsLocalRetention()
        testDisabledStateExplainsLocalBehaviorAndKeepsExistingCopyRecovery()
        testListRowsShowCopyStatusAndFinalTextOnlyForCopyRows()
        testExpiredRowsDoNotExposeFinalText()
        testNewestItemsAreShownFirstAndLimited()

        print("RecentWisprsHistoryMenuStateTests passed")
    }

    private static func testEmptyEnabledStateExplainsLocalRetention() {
        let state = RecentWisprsHistoryMenuState.make(
            items: [],
            isHistoryEnabled: true,
            now: fixtureNow
        )

        expect(state.rows.count == 1, "empty enabled state should have one explanatory row")
        expect(state.rows[0].kind == .message, "empty enabled state should be a message")
        expect(!state.rows[0].isEnabled, "empty enabled state should not be actionable")
        expect(state.rows[0].title.contains("No Recent Wisprs"), "empty enabled state should name the surface")
        expect(state.rows[0].title.contains("expire after 7 days"), "empty enabled state should explain local retention")
        expect(!state.canClearHistory, "empty state should disable clear history")
    }

    private static func testDisabledStateExplainsLocalBehaviorAndKeepsExistingCopyRecovery() {
        let item = recentWispr(
            id: "recent_wispr_disabled_existing",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_DISABLED_EXISTING",
            createdAt: fixtureNow.addingTimeInterval(-120),
            insertionStatus: .insertionFailed
        )

        let state = RecentWisprsHistoryMenuState.make(
            items: [item],
            isHistoryEnabled: false,
            now: fixtureNow
        )

        expect(state.rows.count == 2, "disabled state with existing local entries should include message and copy row")
        expect(state.rows[0].kind == .message, "first disabled row should explain state")
        expect(state.rows[0].title.contains("Recent Wisprs Off"), "disabled message should say history is off")
        expect(state.rows[0].title.contains("new local copies will not be saved"), "disabled message should explain local behavior")
        expect(!state.rows[0].title.contains(item.finalText), "disabled message must not expose final text")
        expect(state.rows[1].copyID == item.id, "existing disabled-history entry should remain copy recoverable")
        expect(state.rows[1].title.contains("Copy Wispr"), "copy action should be visible")
        expect(state.rows[1].title.contains("Insertion failed"), "failed insertion status should be visible")
        expect(state.canClearHistory, "disabled state with entries should allow clear history")
    }

    private static func testListRowsShowCopyStatusAndFinalTextOnlyForCopyRows() {
        let inserted = recentWispr(
            id: "recent_wispr_inserted",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_INSERTED",
            createdAt: fixtureNow.addingTimeInterval(-3_600),
            insertionStatus: .inserted
        )
        let failed = recentWispr(
            id: "recent_wispr_failed",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_FAILED",
            createdAt: fixtureNow.addingTimeInterval(-60),
            insertionStatus: .insertionFailed
        )

        let state = RecentWisprsHistoryMenuState.make(
            items: [inserted, failed],
            isHistoryEnabled: true,
            now: fixtureNow
        )

        expect(state.rows.count == 2, "list state should show two copy rows")
        expect(state.rows.allSatisfy { $0.copyID != nil }, "list rows should be copy actions")
        expect(state.rows[0].title.contains("SYNTHETIC_RECENT_WISPR_TEXT_FAILED"), "copy row should show final text after explicit menu open")
        expect(state.rows[0].title.contains("Insertion failed"), "copy row should show failed insertion status")
        expect(state.rows[1].title.contains("SYNTHETIC_RECENT_WISPR_TEXT_INSERTED"), "copy row should show inserted final text")
        expect(state.rows[1].title.contains("Inserted"), "copy row should show inserted status")

        for forbidden in ["rawTranscript", "audio", "prompt", "context", "clipboard", "selectedText", "windowTitle"] {
            expect(!state.rows.map(\.title).joined(separator: " ").localizedCaseInsensitiveContains(forbidden), "menu rows should not mention \(forbidden)")
        }
    }

    private static func testExpiredRowsDoNotExposeFinalText() {
        let expired = recentWispr(
            id: "recent_wispr_expired",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_EXPIRED",
            createdAt: fixtureNow.addingTimeInterval(-RecentWisprStore.defaultRetentionSeconds - 120),
            expiresAt: fixtureNow.addingTimeInterval(-120),
            insertionStatus: .inserted
        )

        let state = RecentWisprsHistoryMenuState.make(
            items: [expired],
            isHistoryEnabled: true,
            now: fixtureNow
        )

        expect(state.rows.count == 1, "expired state should render a single state row")
        expect(state.rows[0].kind == .message, "expired state should not be copyable")
        expect(!state.rows[0].isEnabled, "expired row should be disabled")
        expect(state.rows[0].title.contains("Expired Wispr"), "expired row should explain state")
        expect(!state.rows[0].title.contains(expired.finalText), "expired state must not expose final text")
        expect(state.canClearHistory, "expired stale entries should allow clear cleanup")
    }

    private static func testNewestItemsAreShownFirstAndLimited() {
        let items = (0..<12).map { offset in
            recentWispr(
                id: String(format: "recent_wispr_id_%02d", offset),
                finalText: "SYNTHETIC_RECENT_WISPR_TEXT_\(offset)",
                createdAt: fixtureNow.addingTimeInterval(TimeInterval(offset)),
                insertionStatus: .inserted
            )
        }

        let state = RecentWisprsHistoryMenuState.make(
            items: items,
            isHistoryEnabled: true,
            now: fixtureNow.addingTimeInterval(20),
            limit: 10
        )

        expect(state.rows.count == 10, "menu state should cap visible recent wisprs")
        expect(state.rows[0].copyID == "recent_wispr_id_11", "newest item should be first")
        expect(state.rows[9].copyID == "recent_wispr_id_02", "oldest visible item should respect cap")
    }

    private static let fixtureNow = Date(timeIntervalSince1970: 1_800_000_000)

    private static func recentWispr(
        id: String,
        finalText: String,
        createdAt: Date,
        expiresAt: Date? = nil,
        insertionStatus: RecentWisprInsertionStatus
    ) -> RecentWispr {
        RecentWispr(
            id: id,
            finalText: finalText,
            createdAt: createdAt,
            expiresAt: expiresAt ?? createdAt.addingTimeInterval(RecentWisprStore.defaultRetentionSeconds),
            insertionStatus: insertionStatus,
            source: .dictation,
            destinationAppCategory: "plain_text_editor",
            copiedAt: nil
        )
    }
}
