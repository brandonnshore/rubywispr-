import Foundation

enum RecentWisprRecoveryCopyResult: Equatable {
    case copied
    case notFound
    case writeFailed
}

protocol RecentWisprRecoveryStore {
    func listItems() -> [RecentWispr]
    @discardableResult
    func markCopied(id: String) -> RecentWispr?
}

protocol RecentWisprRecoveryClipboard {
    func copyRecentWisprText(_ finalText: String) -> Bool
}

extension RecentWisprStore: RecentWisprRecoveryStore {}

struct ClipboardFallbackRecentWisprRecoveryClipboard: RecentWisprRecoveryClipboard {
    let manager: ClipboardFallbackManager

    func copyRecentWisprText(_ finalText: String) -> Bool {
        guard case .copied = manager.copyCleanedText(
            finalText,
            reason: .manualCopyRecovery,
            restorePreviousClipboard: false
        ) else {
            return false
        }
        return true
    }
}

struct RecentWisprRecoveryController {
    private let store: RecentWisprRecoveryStore
    private let clipboard: RecentWisprRecoveryClipboard

    init(
        store: RecentWisprRecoveryStore,
        clipboard: RecentWisprRecoveryClipboard
    ) {
        self.store = store
        self.clipboard = clipboard
    }

    @discardableResult
    func copyWispr(id: String) -> RecentWisprRecoveryCopyResult {
        guard let item = store.listItems().first(where: { $0.id == id }) else {
            return .notFound
        }

        guard clipboard.copyRecentWisprText(item.finalText) else {
            return .writeFailed
        }

        _ = store.markCopied(id: id)
        return .copied
    }
}
