import AppKit
import ApplicationServices
import Foundation
import os.log

enum DirectInsertionResultState: String, Codable, Equatable {
    case inserted
    case unavailable
    case ambiguous
    case blocked
    case failed
}

enum DirectInsertionOutcome: String, Codable, Equatable {
    case directInsertionSucceeded = "direct_insertion_succeeded"
    case insertionUnavailable = "insertion_unavailable"
    case directInsertionFailed = "direct_insertion_failed"
    case directInsertionSkippedUnsafe = "direct_insertion_skipped_unsafe"
    case directInsertionAmbiguous = "direct_insertion_ambiguous"
}

enum DirectInsertionPermissionCategory: String, Codable, Equatable {
    case trusted
    case denied
    case unavailable
    case policyBlocked = "policy_blocked"

    var allowsInsertion: Bool {
        self == .trusted
    }
}

enum DirectInsertionTargetCategory: String, Codable, Equatable {
    case plainTextEditor = "plain_text_editor"
    case richTextEditor = "rich_text_editor"
    case browserTextField = "browser_text_field"
    case messagingDraftField = "messaging_draft_field"
    case emailDraftField = "email_draft_field"
    case codeEditor = "code_editor"
}

enum DirectInsertionUnsafeTargetCategory: String, Codable, Equatable {
    case secureInput = "secure_input"
    case readOnlyOrDisabled = "read_only_or_disabled"
    case noFocusedTarget = "no_focused_target"
    case terminalOrShell = "terminal_or_shell"
    case productionOrAdminSurface = "production_or_admin_surface"
    case privateConversationOrRealEmail = "private_conversation_or_real_email"
    case unknownOrUnclassified = "unknown_or_unclassified"
}

enum DirectInsertionFailureReason: String, Codable, Equatable {
    case noFinalText = "no_final_text"
    case appIneligible = "app_ineligible"
    case islandNotInserting = "island_not_inserting"
    case duplicateAttempt = "duplicate_attempt"
    case permissionDenied = "permission_denied"
    case permissionUnavailable = "permission_unavailable"
    case permissionPolicyBlocked = "permission_policy_blocked"
    case noFocusedTarget = "no_focused_target"
    case unsafeTarget = "unsafe_target"
    case deterministicFailure = "deterministic_failure"
    case preflightTimeout = "preflight_timeout"
    case attemptTimeout = "attempt_timeout"
    case targetAmbiguous = "target_ambiguous"
}

enum DirectInsertionLocalHistoryStatus: String, Codable, Equatable {
    case inserted
    case insertionFailed = "insertion_failed"
}

enum DirectInsertionTargetClassification: Equatable {
    case allowed(DirectInsertionTargetCategory)
    case unavailable(DirectInsertionUnsafeTargetCategory)
    case unsafe(DirectInsertionUnsafeTargetCategory)
    case ambiguous

    var targetCategory: DirectInsertionTargetCategory? {
        if case .allowed(let category) = self {
            return category
        }
        return nil
    }

    var unsafeCategory: DirectInsertionUnsafeTargetCategory? {
        switch self {
        case .unavailable(let category), .unsafe(let category):
            return category
        case .allowed, .ambiguous:
            return nil
        }
    }
}

enum DirectInsertionWriteResult: Equatable {
    case accepted
    case rejected
    case ambiguous
}

enum DirectInsertionAppEligibility: String, Codable, Equatable {
    case eligible
    case ineligible
}

struct DirectInsertionRequest: Equatable {
    var requestId: String?
    var finalText: String
    var appEligibility: DirectInsertionAppEligibility
    var islandIsInserting: Bool

    init(
        requestId: String? = nil,
        finalText: String,
        appEligibility: DirectInsertionAppEligibility = .eligible,
        islandIsInserting: Bool = true
    ) {
        self.requestId = requestId
        self.finalText = finalText
        self.appEligibility = appEligibility
        self.islandIsInserting = islandIsInserting
    }
}

struct DirectInsertionResult: Codable, Equatable {
    var state: DirectInsertionResultState
    var outcome: DirectInsertionOutcome
    var reason: DirectInsertionFailureReason?
    var targetCategory: DirectInsertionTargetCategory?
    var unsafeTargetCategory: DirectInsertionUnsafeTargetCategory?
    var permissionCategory: DirectInsertionPermissionCategory
    var localHistoryStatus: DirectInsertionLocalHistoryStatus?

    var destinationAppCategory: String? {
        targetCategory?.rawValue ?? unsafeTargetCategory?.rawValue
    }
}

struct DirectInsertionEvent: Codable, Equatable {
    var outcome: DirectInsertionOutcome
    var resultState: DirectInsertionResultState
    var reason: DirectInsertionFailureReason?
    var targetCategory: DirectInsertionTargetCategory?
    var unsafeTargetCategory: DirectInsertionUnsafeTargetCategory?
    var permissionCategory: DirectInsertionPermissionCategory
    var requestId: String?
    var durationMs: Int
}

protocol DirectInsertionPermissionPort {
    func currentPermissionCategory() -> DirectInsertionPermissionCategory
}

protocol InsertionTargetClassifier {
    func classifyFocusedTarget() -> DirectInsertionTargetClassification
}

protocol DirectInsertionPort {
    func insertFinalText(_ finalText: String, into targetCategory: DirectInsertionTargetCategory) async -> DirectInsertionWriteResult
}

protocol DirectInsertionEventSink {
    func record(_ event: DirectInsertionEvent)
}

struct NoOpDirectInsertionEventSink: DirectInsertionEventSink {
    func record(_ event: DirectInsertionEvent) {
        _ = event
    }
}

protocol DirectInsertionClock {
    func now() -> Date
}

final class DirectInsertionAttemptGate {
    private let lock = NSLock()
    private var attemptInFlight = false

    func beginAttempt() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !attemptInFlight else { return false }
        attemptInFlight = true
        return true
    }

    func endAttempt() {
        lock.lock()
        attemptInFlight = false
        lock.unlock()
    }
}

struct SystemDirectInsertionClock: DirectInsertionClock {
    func now() -> Date {
        Date()
    }
}

struct DirectInsertionTimeouts: Equatable {
    var targetPreflightTimeout: TimeInterval
    var directInsertionAttemptTimeout: TimeInterval

    static let conservative = DirectInsertionTimeouts(
        targetPreflightTimeout: 0.250,
        directInsertionAttemptTimeout: 1.500
    )
}

struct DirectInsertionCoordinator {
    private let permissionPort: DirectInsertionPermissionPort
    private let targetClassifier: InsertionTargetClassifier
    private let insertionPort: DirectInsertionPort
    private let eventSink: DirectInsertionEventSink
    private let clock: DirectInsertionClock
    private let timeouts: DirectInsertionTimeouts
    private let attemptGate: DirectInsertionAttemptGate

    init(
        permissionPort: DirectInsertionPermissionPort,
        targetClassifier: InsertionTargetClassifier,
        insertionPort: DirectInsertionPort,
        eventSink: DirectInsertionEventSink = NoOpDirectInsertionEventSink(),
        clock: DirectInsertionClock = SystemDirectInsertionClock(),
        timeouts: DirectInsertionTimeouts = .conservative,
        attemptGate: DirectInsertionAttemptGate = DirectInsertionAttemptGate()
    ) {
        self.permissionPort = permissionPort
        self.targetClassifier = targetClassifier
        self.insertionPort = insertionPort
        self.eventSink = eventSink
        self.clock = clock
        self.timeouts = timeouts
        self.attemptGate = attemptGate
    }

    func attempt(_ request: DirectInsertionRequest) async -> DirectInsertionResult {
        let startedAt = clock.now()
        let finalText = request.finalText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !finalText.isEmpty else {
            return finish(
                state: .unavailable,
                outcome: .insertionUnavailable,
                reason: .noFinalText,
                permissionCategory: .unavailable,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: false
            )
        }

        guard request.appEligibility == .eligible else {
            return finish(
                state: .unavailable,
                outcome: .insertionUnavailable,
                reason: .appIneligible,
                permissionCategory: .unavailable,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        }

        guard request.islandIsInserting else {
            return finish(
                state: .unavailable,
                outcome: .insertionUnavailable,
                reason: .islandNotInserting,
                permissionCategory: .unavailable,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        }

        guard attemptGate.beginAttempt() else {
            return finish(
                state: .blocked,
                outcome: .insertionUnavailable,
                reason: .duplicateAttempt,
                permissionCategory: .unavailable,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: false
            )
        }
        defer {
            attemptGate.endAttempt()
        }

        let permission = permissionPort.currentPermissionCategory()
        guard permission.allowsInsertion else {
            return finish(
                state: .blocked,
                outcome: .insertionUnavailable,
                reason: permissionFailureReason(permission),
                permissionCategory: permission,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        }

        let classification = targetClassifier.classifyFocusedTarget()
        if elapsed(since: startedAt) > timeouts.targetPreflightTimeout {
            return finish(
                state: .ambiguous,
                outcome: .directInsertionAmbiguous,
                reason: .preflightTimeout,
                targetCategory: classification.targetCategory,
                unsafeTargetCategory: classification.unsafeCategory,
                permissionCategory: permission,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        }

        guard case .allowed(let targetCategory) = classification else {
            switch classification {
            case .unavailable(let unsafeCategory):
                return finish(
                    state: .unavailable,
                    outcome: .insertionUnavailable,
                    reason: .noFocusedTarget,
                    unsafeTargetCategory: unsafeCategory,
                    permissionCategory: permission,
                    requestId: request.requestId,
                    startedAt: startedAt,
                    hasFinalText: true
                )
            case .unsafe(let unsafeCategory):
                return finish(
                    state: .blocked,
                    outcome: .directInsertionSkippedUnsafe,
                    reason: .unsafeTarget,
                    unsafeTargetCategory: unsafeCategory,
                    permissionCategory: permission,
                    requestId: request.requestId,
                    startedAt: startedAt,
                    hasFinalText: true
                )
            case .ambiguous:
                return finish(
                    state: .ambiguous,
                    outcome: .directInsertionAmbiguous,
                    reason: .targetAmbiguous,
                    permissionCategory: permission,
                    requestId: request.requestId,
                    startedAt: startedAt,
                    hasFinalText: true
                )
            case .allowed:
                preconditionFailure("allowed target handled by guard")
            }
        }

        let attemptStartedAt = clock.now()
        let writeResult = await insertionPort.insertFinalText(finalText, into: targetCategory)
        if elapsed(since: attemptStartedAt) > timeouts.directInsertionAttemptTimeout {
            return finish(
                state: .ambiguous,
                outcome: .directInsertionAmbiguous,
                reason: .attemptTimeout,
                targetCategory: targetCategory,
                permissionCategory: permission,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        }

        switch writeResult {
        case .accepted:
            return finish(
                state: .inserted,
                outcome: .directInsertionSucceeded,
                targetCategory: targetCategory,
                permissionCategory: permission,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        case .rejected:
            return finish(
                state: .failed,
                outcome: .directInsertionFailed,
                reason: .deterministicFailure,
                targetCategory: targetCategory,
                permissionCategory: permission,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        case .ambiguous:
            return finish(
                state: .ambiguous,
                outcome: .directInsertionAmbiguous,
                reason: .targetAmbiguous,
                targetCategory: targetCategory,
                permissionCategory: permission,
                requestId: request.requestId,
                startedAt: startedAt,
                hasFinalText: true
            )
        }
    }

    private func finish(
        state: DirectInsertionResultState,
        outcome: DirectInsertionOutcome,
        reason: DirectInsertionFailureReason? = nil,
        targetCategory: DirectInsertionTargetCategory? = nil,
        unsafeTargetCategory: DirectInsertionUnsafeTargetCategory? = nil,
        permissionCategory: DirectInsertionPermissionCategory,
        requestId: String?,
        startedAt: Date,
        hasFinalText: Bool
    ) -> DirectInsertionResult {
        let historyStatus: DirectInsertionLocalHistoryStatus?
        if !hasFinalText {
            historyStatus = nil
        } else {
            historyStatus = state == .inserted ? .inserted : .insertionFailed
        }

        let result = DirectInsertionResult(
            state: state,
            outcome: outcome,
            reason: reason,
            targetCategory: targetCategory,
            unsafeTargetCategory: unsafeTargetCategory,
            permissionCategory: permissionCategory,
            localHistoryStatus: historyStatus
        )
        eventSink.record(DirectInsertionEvent(
            outcome: outcome,
            resultState: state,
            reason: reason,
            targetCategory: targetCategory,
            unsafeTargetCategory: unsafeTargetCategory,
            permissionCategory: permissionCategory,
            requestId: requestId,
            durationMs: max(0, Int(elapsed(since: startedAt) * 1000))
        ))
        return result
    }

    private func elapsed(since date: Date) -> TimeInterval {
        clock.now().timeIntervalSince(date)
    }

    private func permissionFailureReason(_ permission: DirectInsertionPermissionCategory) -> DirectInsertionFailureReason {
        switch permission {
        case .trusted:
            return .permissionUnavailable
        case .denied:
            return .permissionDenied
        case .unavailable:
            return .permissionUnavailable
        case .policyBlocked:
            return .permissionPolicyBlocked
        }
    }
}

struct MacAccessibilityInsertionPermissionPort: DirectInsertionPermissionPort {
    func currentPermissionCategory() -> DirectInsertionPermissionCategory {
        AXIsProcessTrusted() ? .trusted : .denied
    }
}

struct MacAccessibilityInsertionTargetClassifier: InsertionTargetClassifier {
    func classifyFocusedTarget() -> DirectInsertionTargetClassification {
        guard AXIsProcessTrusted() else {
            return .ambiguous
        }

        guard let frontmostApp = NSWorkspace.shared.frontmostApplication else {
            return .unavailable(.noFocusedTarget)
        }

        let appElement = AXUIElementCreateApplication(frontmostApp.processIdentifier)
        guard let focusedElement = accessibilityElement(
            from: appElement,
            attribute: kAXFocusedUIElementAttribute as CFString
        ) else {
            return .unavailable(.noFocusedTarget)
        }

        if accessibilityBool(from: focusedElement, attribute: kAXFocusedAttribute as CFString) == false {
            return .unavailable(.noFocusedTarget)
        }

        if accessibilityBool(from: focusedElement, attribute: kAXEnabledAttribute as CFString) == false {
            return .unsafe(.readOnlyOrDisabled)
        }

        let role = accessibilityString(from: focusedElement, attribute: kAXRoleAttribute as CFString)
        let subrole = accessibilityString(from: focusedElement, attribute: kAXSubroleAttribute as CFString)

        if subrole == (kAXSecureTextFieldSubrole as String) {
            return .unsafe(.secureInput)
        }

        guard isSupportedTextRole(role) else {
            return .unsafe(.unknownOrUnclassified)
        }

        var valueSettable = DarwinBoolean(false)
        let settableResult = AXUIElementIsAttributeSettable(
            focusedElement,
            kAXValueAttribute as CFString,
            &valueSettable
        )
        guard settableResult == .success, valueSettable.boolValue else {
            return .unsafe(.readOnlyOrDisabled)
        }

        return .allowed(.plainTextEditor)
    }

    private func isSupportedTextRole(_ role: String?) -> Bool {
        guard let role else { return false }
        return role == (kAXTextFieldRole as String) ||
            role == (kAXTextAreaRole as String) ||
            role == (kAXComboBoxRole as String)
    }

    private func accessibilityElement(from element: AXUIElement, attribute: CFString) -> AXUIElement? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute, &value)
        guard result == .success,
              let rawValue = value,
              CFGetTypeID(rawValue) == AXUIElementGetTypeID() else {
            return nil
        }
        return unsafeBitCast(rawValue, to: AXUIElement.self)
    }

    private func accessibilityString(from element: AXUIElement, attribute: CFString) -> String? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute, &value)
        guard result == .success, let stringValue = value as? String else { return nil }
        return stringValue
    }

    private func accessibilityBool(from element: AXUIElement, attribute: CFString) -> Bool? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute, &value)
        guard result == .success, let boolValue = value as? Bool else { return nil }
        return boolValue
    }
}

struct DirectKeyboardInsertionPort: DirectInsertionPort {
    func insertFinalText(_ finalText: String, into targetCategory: DirectInsertionTargetCategory) async -> DirectInsertionWriteResult {
        _ = targetCategory
        return insertSynchronously(finalText)
    }

    func insertSynchronously(_ finalText: String) -> DirectInsertionWriteResult {
        let utf16 = Array(finalText.utf16)
        guard !utf16.isEmpty else { return .rejected }

        let source = CGEventSource(stateID: .hidSystemState)
        var offset = 0
        let chunkSize = 20
        while offset < utf16.count {
            let nextOffset = min(offset + chunkSize, utf16.count)
            let chunk = Array(utf16[offset..<nextOffset])
            let posted = chunk.withUnsafeBufferPointer { buffer -> Bool in
                guard let baseAddress = buffer.baseAddress,
                      let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
                      let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else {
                    return false
                }
                keyDown.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: baseAddress)
                keyDown.post(tap: .cgSessionEventTap)
                keyUp.post(tap: .cgSessionEventTap)
                return true
            }
            guard posted else { return .rejected }
            offset = nextOffset
        }
        return .accepted
    }
}

final class ShortcutReleasedDirectInsertionPort: DirectInsertionPort, @unchecked Sendable {
    typealias ShortcutReleaseScheduler = (@escaping () -> Void) -> Void

    private let keyboardPort: DirectKeyboardInsertionPort
    private let scheduleAfterShortcutRelease: ShortcutReleaseScheduler

    init(
        keyboardPort: DirectKeyboardInsertionPort = DirectKeyboardInsertionPort(),
        scheduleAfterShortcutRelease: @escaping ShortcutReleaseScheduler
    ) {
        self.keyboardPort = keyboardPort
        self.scheduleAfterShortcutRelease = scheduleAfterShortcutRelease
    }

    func insertFinalText(_ finalText: String, into targetCategory: DirectInsertionTargetCategory) async -> DirectInsertionWriteResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async {
                self.scheduleAfterShortcutRelease {
                    let result = self.keyboardPort.insertSynchronously(finalText)
                    continuation.resume(returning: result)
                }
            }
        }
    }
}

struct OSLogDirectInsertionEventSink: DirectInsertionEventSink {
    private let log: OSLog

    init(log: OSLog) {
        self.log = log
    }

    func record(_ event: DirectInsertionEvent) {
        os_log(
            .info,
            log: log,
            "direct_insertion outcome=%{public}@ state=%{public}@ reason=%{public}@ target=%{public}@ unsafe_target=%{public}@ permission=%{public}@ duration_ms=%{public}d request_id=%{public}@",
            event.outcome.rawValue,
            event.resultState.rawValue,
            event.reason?.rawValue ?? "none",
            event.targetCategory?.rawValue ?? "none",
            event.unsafeTargetCategory?.rawValue ?? "none",
            event.permissionCategory.rawValue,
            event.durationMs,
            event.requestId ?? "none"
        )
    }
}
