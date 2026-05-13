import Foundation

enum DictationShortcutAction: Equatable {
    case start(RecordingTriggerMode)
    case stop
    case stopAfterHoldTapGrace
    case switchedToToggle
}

final class DictationShortcutSessionController {
    private(set) var activeMode: RecordingTriggerMode?
    private(set) var toggleStopArmed = false
    private var activeModeStartedAt: Date?
    private let holdTapGraceMaximumDuration: TimeInterval
    private let clock: () -> Date

    init(
        holdTapGraceMaximumDuration: TimeInterval = 0.45,
        clock: @escaping () -> Date = { Date() }
    ) {
        self.holdTapGraceMaximumDuration = holdTapGraceMaximumDuration
        self.clock = clock
    }

    func handle(event: ShortcutEvent, isTranscribing: Bool) -> DictationShortcutAction? {
        if activeMode == nil {
            guard !isTranscribing else { return nil }
            switch event {
            case .toggleActivated:
                activeMode = .toggle
                activeModeStartedAt = clock()
                toggleStopArmed = false
                return .start(.toggle)
            case .holdActivated:
                activeMode = .hold
                activeModeStartedAt = clock()
                toggleStopArmed = false
                return .start(.hold)
            case .holdDeactivated, .toggleDeactivated:
                return nil
            }
        }

        guard let mode = activeMode else { return nil }

        switch mode {
        case .hold:
            switch event {
            case .toggleActivated:
                activeMode = .toggle
                activeModeStartedAt = clock()
                toggleStopArmed = false
                return .switchedToToggle
            case .holdDeactivated:
                guard shouldWaitForHoldTapGrace() else {
                    reset()
                    return .stop
                }
                return .stopAfterHoldTapGrace
            case .holdActivated, .toggleDeactivated:
                return nil
            }

        case .toggle:
            switch event {
            case .toggleDeactivated:
                toggleStopArmed = true
                return nil
            case .toggleActivated:
                guard toggleStopArmed else { return nil }
                reset()
                return .stop
            case .holdActivated:
                reset()
                return .stop
            case .holdDeactivated:
                return nil
            }
        }
    }

    func beginManual(mode: RecordingTriggerMode) {
        activeMode = mode
        activeModeStartedAt = clock()
        toggleStopArmed = false
    }

    func forceToggleMode() {
        activeMode = .toggle
        activeModeStartedAt = clock()
        toggleStopArmed = false
    }

    @discardableResult
    func resetActiveSession() -> RecordingTriggerMode? {
        let mode = activeMode
        reset()
        return mode
    }

    func reset() {
        activeMode = nil
        activeModeStartedAt = nil
        toggleStopArmed = false
    }

    private func shouldWaitForHoldTapGrace() -> Bool {
        guard let activeModeStartedAt else { return false }
        return clock().timeIntervalSince(activeModeStartedAt) <= holdTapGraceMaximumDuration
    }
}
