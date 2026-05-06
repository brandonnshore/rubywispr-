import Foundation

enum RecentWisprInsertionStatus: String, Codable, Equatable {
    case inserted
    case insertionFailed = "insertion_failed"
}

enum RecentWisprSource: String, Codable, Equatable {
    case dictation
}

struct RecentWispr: Codable, Equatable, Identifiable {
    let id: String
    let finalText: String
    let createdAt: Date
    let expiresAt: Date
    let insertionStatus: RecentWisprInsertionStatus
    let source: RecentWisprSource
    let destinationAppCategory: String?
    var copiedAt: Date?
}

struct RecentWisprSnapshot: Codable, Equatable {
    var isHistoryEnabled: Bool
    var items: [RecentWispr]

    static let empty = RecentWisprSnapshot(isHistoryEnabled: true, items: [])
}

protocol RecentWisprPersistence {
    func data(forKey defaultName: String) -> Data?
    func set(_ value: Any?, forKey defaultName: String)
    func removeObject(forKey defaultName: String)
}

extension UserDefaults: RecentWisprPersistence {}

final class RecentWisprStore {
    static let defaultStorageKey = "recent_wisprs"
    static let defaultRetentionSeconds: TimeInterval = 7 * 24 * 60 * 60

    private let persistence: RecentWisprPersistence
    private let storageKey: String
    private let retentionSeconds: TimeInterval
    private let idProvider: () -> String
    private let dateProvider: () -> Date
    private var snapshot: RecentWisprSnapshot

    init(
        persistence: RecentWisprPersistence = UserDefaults.standard,
        storageKey: String = RecentWisprStore.defaultStorageKey,
        retentionSeconds: TimeInterval = RecentWisprStore.defaultRetentionSeconds,
        idProvider: @escaping () -> String = { UUID().uuidString },
        dateProvider: @escaping () -> Date = { Date() }
    ) {
        self.persistence = persistence
        self.storageKey = storageKey
        self.retentionSeconds = retentionSeconds
        self.idProvider = idProvider
        self.dateProvider = dateProvider
        self.snapshot = Self.loadSnapshot(from: persistence, storageKey: storageKey)
        expireItems(now: dateProvider())
    }

    var isHistoryEnabled: Bool {
        snapshot.isHistoryEnabled
    }

    func listItems() -> [RecentWispr] {
        expireItems(now: dateProvider())
        return sortedItems(snapshot.items)
    }

    @discardableResult
    func recordFinalText(
        _ finalText: String,
        insertionStatus: RecentWisprInsertionStatus,
        destinationAppCategory: String? = nil
    ) -> RecentWispr? {
        expireItems(now: dateProvider())
        guard snapshot.isHistoryEnabled else { return nil }

        let trimmedText = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return nil }

        let createdAt = dateProvider()
        let item = RecentWispr(
            id: idProvider(),
            finalText: trimmedText,
            createdAt: createdAt,
            expiresAt: createdAt.addingTimeInterval(retentionSeconds),
            insertionStatus: insertionStatus,
            source: .dictation,
            destinationAppCategory: normalizedDestinationAppCategory(destinationAppCategory),
            copiedAt: nil
        )
        snapshot.items.append(item)
        persist()
        return item
    }

    @discardableResult
    func markCopied(id: String) -> RecentWispr? {
        expireItems(now: dateProvider())
        guard let index = snapshot.items.firstIndex(where: { $0.id == id }) else {
            return nil
        }

        snapshot.items[index].copiedAt = dateProvider()
        persist()
        return snapshot.items[index]
    }

    func clearHistory() {
        snapshot.items = []
        persist()
    }

    func setHistoryEnabled(_ enabled: Bool) {
        snapshot.isHistoryEnabled = enabled
        persist()
    }

    func disableAndClearHistory() {
        snapshot.isHistoryEnabled = false
        snapshot.items = []
        persist()
    }

    @discardableResult
    func cleanupExpiredItems() -> Int {
        expireItems(now: dateProvider())
    }

    @discardableResult
    private func expireItems(now: Date) -> Int {
        let beforeCount = snapshot.items.count
        snapshot.items = snapshot.items.filter { $0.expiresAt > now }
        let removedCount = beforeCount - snapshot.items.count
        if removedCount > 0 {
            persist()
        }
        return removedCount
    }

    private func persist() {
        guard let data = try? JSONEncoder.rubyWhisperRecentWisprs.encode(snapshot) else {
            return
        }
        persistence.set(data, forKey: storageKey)
    }

    private static func loadSnapshot(
        from persistence: RecentWisprPersistence,
        storageKey: String
    ) -> RecentWisprSnapshot {
        guard let data = persistence.data(forKey: storageKey) else {
            return .empty
        }

        guard let decoded = try? JSONDecoder.rubyWhisperRecentWisprs.decode(
            RecentWisprSnapshot.self,
            from: data
        ) else {
            persistence.removeObject(forKey: storageKey)
            return .empty
        }

        let sanitized = sanitizedSnapshot(decoded)
        if sanitized != decoded,
           let data = try? JSONEncoder.rubyWhisperRecentWisprs.encode(sanitized) {
            persistence.set(data, forKey: storageKey)
        }
        return sanitized
    }

    private static func sanitizedSnapshot(_ snapshot: RecentWisprSnapshot) -> RecentWisprSnapshot {
        let items = snapshot.items.compactMap { item -> RecentWispr? in
            let trimmedText = item.finalText.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedID = item.id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedText.isEmpty,
                  !trimmedID.isEmpty,
                  item.expiresAt > item.createdAt else {
                return nil
            }
            return RecentWispr(
                id: trimmedID,
                finalText: trimmedText,
                createdAt: item.createdAt,
                expiresAt: item.expiresAt,
                insertionStatus: item.insertionStatus,
                source: item.source,
                destinationAppCategory: normalizedDestinationAppCategory(item.destinationAppCategory),
                copiedAt: item.copiedAt
            )
        }
        return RecentWisprSnapshot(isHistoryEnabled: snapshot.isHistoryEnabled, items: items)
    }

    private func sortedItems(_ items: [RecentWispr]) -> [RecentWispr] {
        items.sorted {
            if $0.createdAt == $1.createdAt {
                return $0.id > $1.id
            }
            return $0.createdAt > $1.createdAt
        }
    }

    private static func normalizedDestinationAppCategory(_ rawCategory: String?) -> String? {
        guard let rawCategory else { return nil }
        let trimmed = rawCategory.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private func normalizedDestinationAppCategory(_ rawCategory: String?) -> String? {
        Self.normalizedDestinationAppCategory(rawCategory)
    }
}

private extension JSONEncoder {
    static var rubyWhisperRecentWisprs: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

private extension JSONDecoder {
    static var rubyWhisperRecentWisprs: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
