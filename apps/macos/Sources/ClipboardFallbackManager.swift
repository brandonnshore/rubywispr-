import AppKit
import Foundation
import os.log

enum ClipboardFallbackState: String, Codable, Equatable {
    case fallbackCopied = "fallback_copied"
    case clipboardRestored = "clipboard_restored"
    case clipboardRestoreSkipped = "clipboard_restore_skipped"
    case manualCopyRecovery = "manual_copy_recovery"
}

enum ClipboardFallbackCopyReason: String, Codable, Equatable {
    case automaticFallback = "automatic_fallback"
    case manualCopyRecovery = "manual_copy_recovery"
}

enum ClipboardFallbackSnapshotStatus: String, Codable, Equatable {
    case supported
    case unsupported
    case unavailable
    case disabled
}

enum ClipboardFallbackRestoreSkipReason: String, Codable, Equatable {
    case restorationDisabled = "restoration_disabled"
    case unsupportedData = "unsupported_data"
    case pasteboardUnavailable = "pasteboard_unavailable"
    case ownershipChanged = "ownership_changed"
    case writeFailed = "write_failed"
    case restoreFailed = "restore_failed"
}

enum ClipboardFallbackCopyResult: Equatable {
    case copied(restoration: ClipboardFallbackRestorationPlan)
    case emptyText
    case writeFailed
}

enum ClipboardFallbackRestorationPlan: Equatable {
    case pending(ownerToken: UUID, expectedChangeCount: Int)
    case skipped(ClipboardFallbackRestoreSkipReason)
}

struct ClipboardFallbackEvent: Codable, Equatable {
    var state: ClipboardFallbackState
    var reason: ClipboardFallbackCopyReason
    var snapshotStatus: ClipboardFallbackSnapshotStatus
    var skipReason: ClipboardFallbackRestoreSkipReason?
}

struct ClipboardFallbackSnapshot {
    fileprivate var items: [ClipboardFallbackSnapshotItem]

    static let empty = ClipboardFallbackSnapshot(items: [])
}

private struct ClipboardFallbackSnapshotItem {
    var entries: [ClipboardFallbackSnapshotEntry]
}

private struct ClipboardFallbackSnapshotEntry {
    var type: NSPasteboard.PasteboardType
    var value: String
}

enum ClipboardFallbackSnapshotResult {
    case supported(ClipboardFallbackSnapshot)
    case unsupported
    case unavailable

    var status: ClipboardFallbackSnapshotStatus {
        switch self {
        case .supported:
            return .supported
        case .unsupported:
            return .unsupported
        case .unavailable:
            return .unavailable
        }
    }
}

protocol ClipboardFallbackPasteboardPort {
    var changeCount: Int { get }
    func captureSupportedSnapshot() -> ClipboardFallbackSnapshotResult
    func writeFallbackText(_ text: String, ownerToken: UUID) -> Int?
    func ownsFallbackText(ownerToken: UUID, expectedChangeCount: Int) -> Bool
    func restore(_ snapshot: ClipboardFallbackSnapshot) -> Bool
}

protocol ClipboardFallbackRestorationScheduler {
    func scheduleRestoration(after delay: TimeInterval, _ action: @escaping () -> Void)
}

protocol ClipboardFallbackEventSink {
    func record(_ event: ClipboardFallbackEvent)
}

struct NoOpClipboardFallbackEventSink: ClipboardFallbackEventSink {
    func record(_ event: ClipboardFallbackEvent) {
        _ = event
    }
}

struct MainQueueClipboardFallbackRestorationScheduler: ClipboardFallbackRestorationScheduler {
    func scheduleRestoration(after delay: TimeInterval, _ action: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: action)
    }
}

final class ClipboardFallbackManager {
    private let pasteboard: ClipboardFallbackPasteboardPort
    private let scheduler: ClipboardFallbackRestorationScheduler
    private let eventSink: ClipboardFallbackEventSink
    private let restoreDelay: TimeInterval

    init(
        pasteboard: ClipboardFallbackPasteboardPort,
        scheduler: ClipboardFallbackRestorationScheduler = MainQueueClipboardFallbackRestorationScheduler(),
        eventSink: ClipboardFallbackEventSink = NoOpClipboardFallbackEventSink(),
        restoreDelay: TimeInterval = 1.0
    ) {
        self.pasteboard = pasteboard
        self.scheduler = scheduler
        self.eventSink = eventSink
        self.restoreDelay = restoreDelay
    }

    func copyCleanedText(
        _ cleanedText: String,
        reason: ClipboardFallbackCopyReason,
        restorePreviousClipboard: Bool
    ) -> ClipboardFallbackCopyResult {
        let textToWrite = cleanedText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !textToWrite.isEmpty else {
            return .emptyText
        }

        let snapshotResult: ClipboardFallbackSnapshotResult?
        if restorePreviousClipboard {
            snapshotResult = pasteboard.captureSupportedSnapshot()
        } else {
            snapshotResult = nil
        }

        let ownerToken = UUID()
        guard let expectedChangeCount = pasteboard.writeFallbackText(textToWrite, ownerToken: ownerToken) else {
            eventSink.record(ClipboardFallbackEvent(
                state: .clipboardRestoreSkipped,
                reason: reason,
                snapshotStatus: snapshotResult?.status ?? .disabled,
                skipReason: .writeFailed
            ))
            return .writeFailed
        }

        eventSink.record(ClipboardFallbackEvent(
            state: reason == .manualCopyRecovery ? .manualCopyRecovery : .fallbackCopied,
            reason: reason,
            snapshotStatus: snapshotResult?.status ?? .disabled,
            skipReason: nil
        ))

        guard restorePreviousClipboard else {
            recordRestoreSkipped(reason: reason, snapshotStatus: .disabled, skipReason: .restorationDisabled)
            return .copied(restoration: .skipped(.restorationDisabled))
        }

        guard let snapshotResult else {
            recordRestoreSkipped(reason: reason, snapshotStatus: .disabled, skipReason: .restorationDisabled)
            return .copied(restoration: .skipped(.restorationDisabled))
        }

        switch snapshotResult {
        case .supported(let snapshot):
            scheduler.scheduleRestoration(after: restoreDelay) { [pasteboard, eventSink] in
                guard pasteboard.ownsFallbackText(
                    ownerToken: ownerToken,
                    expectedChangeCount: expectedChangeCount
                ) else {
                    eventSink.record(ClipboardFallbackEvent(
                        state: .clipboardRestoreSkipped,
                        reason: reason,
                        snapshotStatus: .supported,
                        skipReason: .ownershipChanged
                    ))
                    return
                }

                if pasteboard.restore(snapshot) {
                    eventSink.record(ClipboardFallbackEvent(
                        state: .clipboardRestored,
                        reason: reason,
                        snapshotStatus: .supported,
                        skipReason: nil
                    ))
                } else {
                    eventSink.record(ClipboardFallbackEvent(
                        state: .clipboardRestoreSkipped,
                        reason: reason,
                        snapshotStatus: .supported,
                        skipReason: .restoreFailed
                    ))
                }
            }
            return .copied(restoration: .pending(
                ownerToken: ownerToken,
                expectedChangeCount: expectedChangeCount
            ))
        case .unsupported:
            recordRestoreSkipped(reason: reason, snapshotStatus: .unsupported, skipReason: .unsupportedData)
            return .copied(restoration: .skipped(.unsupportedData))
        case .unavailable:
            recordRestoreSkipped(reason: reason, snapshotStatus: .unavailable, skipReason: .pasteboardUnavailable)
            return .copied(restoration: .skipped(.pasteboardUnavailable))
        }
    }

    private func recordRestoreSkipped(
        reason: ClipboardFallbackCopyReason,
        snapshotStatus: ClipboardFallbackSnapshotStatus,
        skipReason: ClipboardFallbackRestoreSkipReason
    ) {
        eventSink.record(ClipboardFallbackEvent(
            state: .clipboardRestoreSkipped,
            reason: reason,
            snapshotStatus: snapshotStatus,
            skipReason: skipReason
        ))
    }
}

struct SystemClipboardFallbackPasteboardPort: ClipboardFallbackPasteboardPort {
    private static let ownerTokenType = NSPasteboard.PasteboardType(
        "com.rubyadvisory.rubywhisper.clipboard-fallback-owner-token"
    )
    private static let supportedRestorationTypes: Set<NSPasteboard.PasteboardType> = [
        .string,
    ]

    private let pasteboard: NSPasteboard

    init(pasteboard: NSPasteboard = .general) {
        self.pasteboard = pasteboard
    }

    var changeCount: Int {
        pasteboard.changeCount
    }

    func captureSupportedSnapshot() -> ClipboardFallbackSnapshotResult {
        guard let pasteboardItems = pasteboard.pasteboardItems else {
            return .supported(ClipboardFallbackSnapshot(items: []))
        }

        var snapshotItems: [ClipboardFallbackSnapshotItem] = []
        for pasteboardItem in pasteboardItems {
            guard !pasteboardItem.types.isEmpty else {
                return .unsupported
            }

            var entries: [ClipboardFallbackSnapshotEntry] = []
            for type in pasteboardItem.types {
                guard Self.supportedRestorationTypes.contains(type),
                      let value = pasteboardItem.string(forType: type) else {
                    return .unsupported
                }
                entries.append(ClipboardFallbackSnapshotEntry(type: type, value: value))
            }
            snapshotItems.append(ClipboardFallbackSnapshotItem(entries: entries))
        }

        return .supported(ClipboardFallbackSnapshot(items: snapshotItems))
    }

    func writeFallbackText(_ text: String, ownerToken: UUID) -> Int? {
        let item = NSPasteboardItem()
        item.setString(text, forType: .string)
        item.setString(ownerToken.uuidString, forType: Self.ownerTokenType)

        pasteboard.clearContents()
        guard pasteboard.writeObjects([item]) else { return nil }
        return pasteboard.changeCount
    }

    func ownsFallbackText(ownerToken: UUID, expectedChangeCount: Int) -> Bool {
        guard pasteboard.changeCount == expectedChangeCount else { return false }
        return pasteboard.pasteboardItems?.contains { item in
            item.string(forType: Self.ownerTokenType) == ownerToken.uuidString
        } ?? false
    }

    func restore(_ snapshot: ClipboardFallbackSnapshot) -> Bool {
        pasteboard.clearContents()
        guard !snapshot.items.isEmpty else { return true }
        return pasteboard.writeObjects(snapshot.items.map { snapshotItem in
            let item = NSPasteboardItem()
            for entry in snapshotItem.entries {
                item.setString(entry.value, forType: entry.type)
            }
            return item
        })
    }
}

struct OSLogClipboardFallbackEventSink: ClipboardFallbackEventSink {
    private let log: OSLog

    init(log: OSLog) {
        self.log = log
    }

    func record(_ event: ClipboardFallbackEvent) {
        os_log(
            .info,
            log: log,
            "clipboard_fallback state=%{public}@ reason=%{public}@ snapshot=%{public}@ skip=%{public}@",
            event.state.rawValue,
            event.reason.rawValue,
            event.snapshotStatus.rawValue,
            event.skipReason?.rawValue ?? "none"
        )
    }
}
