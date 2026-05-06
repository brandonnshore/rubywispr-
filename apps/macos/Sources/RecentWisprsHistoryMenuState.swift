import Foundation

enum RecentWisprsHistoryMenuRowKind: Equatable {
    case message
    case copy(id: String)
}

struct RecentWisprsHistoryMenuRow: Identifiable, Equatable {
    let id: String
    let title: String
    let isEnabled: Bool
    let kind: RecentWisprsHistoryMenuRowKind

    var copyID: String? {
        guard case let .copy(id) = kind else { return nil }
        return id
    }
}

struct RecentWisprsHistoryMenuState: Equatable {
    let rows: [RecentWisprsHistoryMenuRow]
    let canClearHistory: Bool

    static func make(
        items rawItems: [RecentWispr],
        isHistoryEnabled: Bool,
        now: Date = Date(),
        limit: Int = 10
    ) -> RecentWisprsHistoryMenuState {
        let items = sortedItems(rawItems).prefix(max(0, limit))
        var rows: [RecentWisprsHistoryMenuRow] = []

        if !isHistoryEnabled {
            rows.append(RecentWisprsHistoryMenuRow(
                id: "recent-wisprs-disabled",
                title: "Recent Wisprs Off - new local copies will not be saved",
                isEnabled: false,
                kind: .message
            ))
        }

        if items.isEmpty {
            rows.append(RecentWisprsHistoryMenuRow(
                id: "recent-wisprs-empty",
                title: isHistoryEnabled
                    ? "No Recent Wisprs yet - local copies expire after 7 days"
                    : "No saved Wisprs - local history is off",
                isEnabled: false,
                kind: .message
            ))
        } else {
            rows.append(contentsOf: items.map { row(for: $0, now: now) })
        }

        return RecentWisprsHistoryMenuState(
            rows: rows,
            canClearHistory: !rawItems.isEmpty
        )
    }

    private static func row(for item: RecentWispr, now: Date) -> RecentWisprsHistoryMenuRow {
        guard item.expiresAt > now else {
            return RecentWisprsHistoryMenuRow(
                id: "recent-wispr-expired-\(item.id)",
                title: "Expired Wispr - removed from local history",
                isEnabled: false,
                kind: .message
            )
        }

        return RecentWisprsHistoryMenuRow(
            id: "recent-wispr-copy-\(item.id)",
            title: [
                "Copy Wispr",
                statusText(for: item.insertionStatus),
                savedText(createdAt: item.createdAt, now: now),
                expiryText(expiresAt: item.expiresAt, now: now),
                snippet(for: item.finalText),
            ].joined(separator: " - "),
            isEnabled: true,
            kind: .copy(id: item.id)
        )
    }

    private static func sortedItems(_ items: [RecentWispr]) -> [RecentWispr] {
        items.sorted {
            if $0.createdAt == $1.createdAt {
                return $0.id > $1.id
            }
            return $0.createdAt > $1.createdAt
        }
    }

    private static func statusText(for status: RecentWisprInsertionStatus) -> String {
        switch status {
        case .inserted:
            return "Inserted"
        case .insertionFailed:
            return "Insertion failed"
        }
    }

    private static func savedText(createdAt: Date, now: Date) -> String {
        let elapsed = max(0, now.timeIntervalSince(createdAt))
        if elapsed < 60 {
            return "Saved now"
        }
        if elapsed < 3_600 {
            return "Saved \(Int(elapsed / 60))m ago"
        }
        if elapsed < 86_400 {
            return "Saved \(Int(elapsed / 3_600))h ago"
        }
        return "Saved \(Int(elapsed / 86_400))d ago"
    }

    private static func expiryText(expiresAt: Date, now: Date) -> String {
        let remaining = expiresAt.timeIntervalSince(now)
        if remaining <= 0 {
            return "Expired"
        }
        if remaining < 86_400 {
            return "Expires today"
        }
        return "Expires in \(Int(ceil(remaining / 86_400)))d"
    }

    private static func snippet(for finalText: String) -> String {
        let text = finalText
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return "(no text)" }
        return text.count > 42 ? String(text.prefix(42)) + "..." : text
    }
}
