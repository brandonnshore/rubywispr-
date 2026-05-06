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

private final class FixtureRecoveryStore: RecentWisprRecoveryStore {
    var items: [RecentWispr]
    private(set) var copiedIDs: [String] = []

    init(items: [RecentWispr]) {
        self.items = items
    }

    func listItems() -> [RecentWispr] {
        items
    }

    @discardableResult
    func markCopied(id: String) -> RecentWispr? {
        copiedIDs.append(id)
        guard let index = items.firstIndex(where: { $0.id == id }) else {
            return nil
        }
        items[index].copiedAt = Date(timeIntervalSince1970: 1_800_000_500)
        return items[index]
    }
}

private final class FixtureRecoveryClipboard: RecentWisprRecoveryClipboard {
    var shouldCopy = true
    private(set) var copiedTexts: [String] = []

    func copyRecentWisprText(_ finalText: String) -> Bool {
        guard shouldCopy else { return false }
        copiedTexts.append(finalText)
        return true
    }
}

@main
private struct RecentWisprRecoveryControllerTests {
    static func main() {
        testFailedInsertionCopyUsesStoredFinalTextAndMarksCopied()
        testInsertedCopyUsesSameSafePath()
        testMissingWisprDoesNotTouchClipboard()
        testClipboardFailureDoesNotMarkCopied()

        print("RecentWisprRecoveryControllerTests passed")
    }

    private static func testFailedInsertionCopyUsesStoredFinalTextAndMarksCopied() {
        let item = recentWispr(
            id: "recent_wispr_id_failed",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_FAILED",
            insertionStatus: .insertionFailed
        )
        let store = FixtureRecoveryStore(items: [item])
        let clipboard = FixtureRecoveryClipboard()
        let controller = RecentWisprRecoveryController(store: store, clipboard: clipboard)

        let result = controller.copyWispr(id: item.id)

        expect(result == .copied, "failed insertion recovery should copy")
        expect(clipboard.copiedTexts == ["SYNTHETIC_RECENT_WISPR_TEXT_FAILED"], "copy should use stored final text only")
        expect(store.copiedIDs == [item.id], "successful copy should update local copied metadata")
        expect(store.items[0].copiedAt != nil, "copied metadata should become recoverable locally")
    }

    private static func testInsertedCopyUsesSameSafePath() {
        let item = recentWispr(
            id: "recent_wispr_id_inserted",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_INSERTED",
            insertionStatus: .inserted
        )
        let store = FixtureRecoveryStore(items: [item])
        let clipboard = FixtureRecoveryClipboard()
        let controller = RecentWisprRecoveryController(store: store, clipboard: clipboard)

        let result = controller.copyWispr(id: item.id)

        expect(result == .copied, "inserted wisprs should remain copyable")
        expect(clipboard.copiedTexts == ["SYNTHETIC_RECENT_WISPR_TEXT_INSERTED"], "inserted copy should use the same clipboard seam")
        expect(store.copiedIDs == [item.id], "inserted copy should mark copied locally")
    }

    private static func testMissingWisprDoesNotTouchClipboard() {
        let store = FixtureRecoveryStore(items: [])
        let clipboard = FixtureRecoveryClipboard()
        let controller = RecentWisprRecoveryController(store: store, clipboard: clipboard)

        let result = controller.copyWispr(id: "recent_wispr_id_missing")

        expect(result == .notFound, "missing wispr should be explicit")
        expect(clipboard.copiedTexts.isEmpty, "missing wispr must not write clipboard")
        expect(store.copiedIDs.isEmpty, "missing wispr must not mark copied")
    }

    private static func testClipboardFailureDoesNotMarkCopied() {
        let item = recentWispr(
            id: "recent_wispr_id_clipboard_failure",
            finalText: "SYNTHETIC_RECENT_WISPR_TEXT_CLIPBOARD_FAILURE",
            insertionStatus: .insertionFailed
        )
        let store = FixtureRecoveryStore(items: [item])
        let clipboard = FixtureRecoveryClipboard()
        clipboard.shouldCopy = false
        let controller = RecentWisprRecoveryController(store: store, clipboard: clipboard)

        let result = controller.copyWispr(id: item.id)

        expect(result == .writeFailed, "clipboard failure should be explicit")
        expect(clipboard.copiedTexts.isEmpty, "failed copy should not expose copied text through success state")
        expect(store.copiedIDs.isEmpty, "failed copy should not mark copied")
    }

    private static func recentWispr(
        id: String,
        finalText: String,
        insertionStatus: RecentWisprInsertionStatus
    ) -> RecentWispr {
        RecentWispr(
            id: id,
            finalText: finalText,
            createdAt: Date(timeIntervalSince1970: 1_800_000_000),
            expiresAt: Date(timeIntervalSince1970: 1_800_604_800),
            insertionStatus: insertionStatus,
            source: .dictation,
            destinationAppCategory: "plain_text_editor",
            copiedAt: nil
        )
    }
}
