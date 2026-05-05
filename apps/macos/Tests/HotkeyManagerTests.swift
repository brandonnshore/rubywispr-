import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

private final class MockHotkeyBackend: HotkeyBackending {
    var onInputEvent: ((ShortcutInputEvent) -> ShortcutConsumeDecision)?
    var onEscapeKeyPressed: (() -> Bool)?
    var onCaptureFailure: ((HotkeyBackendCaptureFailure) -> Void)?
    var startError: Error?
    var startCount = 0
    var stopCount = 0

    func start() throws {
        startCount += 1
        if let startError {
            throw startError
        }
    }

    func stop() {
        stopCount += 1
        _ = onInputEvent?(.backendReset)
    }

    func send(_ event: ShortcutInputEvent) {
        _ = onInputEvent?(event)
    }

    func sendCaptureFailure(_ failure: HotkeyBackendCaptureFailure) {
        onCaptureFailure?(failure)
    }
}

@main
private struct HotkeyManagerTests {
    static func main() throws {
        try registersDefaultHoldAndToggle()
        try exposesRecoverableRegistrationFailureAndRetry()
        try runtimeCaptureFailureBecomesRecoverableUnavailableState()
        try pauseReleasesActiveShortcutState()
        try disabledConfigurationDoesNotStartBackend()
        holdSessionStartsAndStopsOnlyWhileHeld()
        commandFnToggleStartsAndStopsWithoutHoldFallback()
        plainFnStopsActiveToggleWithoutStartingHold()
        resetActiveSessionClearsHeldState()

        print("HotkeyManagerTests passed")
    }

    private static func registersDefaultHoldAndToggle() throws {
        let backend = MockHotkeyBackend()
        let manager = HotkeyManager(backend: backend)

        try manager.register(configuration: ShortcutConfiguration(hold: .defaultHold, toggle: .defaultToggle))

        expect(backend.startCount == 1, "default registration should start backend once")
        expect(manager.registrationState.phase == .registered, "default registration should be registered")
        expect(manager.registrationState.reason == .none, "default registration should have no failure reason")
    }

    private static func exposesRecoverableRegistrationFailureAndRetry() throws {
        let backend = MockHotkeyBackend()
        backend.startError = GlobalShortcutBackendError.eventTapUnavailable
        let manager = HotkeyManager(backend: backend)

        do {
            try manager.register(configuration: ShortcutConfiguration(hold: .defaultHold, toggle: .defaultToggle))
            expect(false, "registration failure should throw")
        } catch {
            expect(manager.registrationState.phase == .disabled, "failed registration should be disabled")
            expect(manager.registrationState.reason == .eventTapUnavailable, "failed registration should map event tap reason")
            expect(manager.registrationState.affectedBinding == .both, "failed registration should affect both bindings")
            expect(manager.registrationState.isRecoverable, "failed registration should be recoverable")
        }

        backend.startError = nil
        try manager.retryRegistration()

        expect(backend.startCount == 2, "retry should re-run backend start")
        expect(manager.registrationState.phase == .registered, "retry should recover registration")
    }

    private static func runtimeCaptureFailureBecomesRecoverableUnavailableState() throws {
        let backend = MockHotkeyBackend()
        let manager = HotkeyManager(backend: backend)

        try manager.register(configuration: ShortcutConfiguration(hold: .defaultHold, toggle: .defaultToggle))
        backend.sendCaptureFailure(.eventTapDisabledByUserInput)

        expect(manager.registrationState.phase == .disabled, "runtime capture failure should disable hotkeys")
        expect(
            manager.registrationState.reason == .eventTapDisabledByUserInput,
            "runtime capture failure should use a categorical reason"
        )
        expect(manager.registrationState.affectedBinding == .both, "runtime capture failure should affect both bindings")
        expect(manager.registrationState.isRecoverable, "runtime capture failure should be recoverable")

        try manager.retryRegistration()

        expect(backend.startCount == 2, "runtime capture failure retry should re-run backend start")
        expect(manager.registrationState.phase == .registered, "runtime capture failure retry should recover registration")
    }

    private static func pauseReleasesActiveShortcutState() throws {
        let backend = MockHotkeyBackend()
        let manager = HotkeyManager(backend: backend)
        var events: [ShortcutEvent] = []
        manager.onShortcutEvent = { events.append($0) }

        try manager.register(configuration: ShortcutConfiguration(hold: .defaultHold, toggle: .defaultToggle))
        backend.send(.modifierChanged(keyCode: 63, isDown: true))
        manager.pause(reason: .onboardingBlocked)

        expect(events == [.holdActivated, .holdDeactivated], "pause should emit a safe hold deactivation")
        expect(manager.registrationState.phase == .disabled, "pause should disable registration")
        expect(manager.registrationState.reason == .paused, "pause should record paused reason")
        expect(!manager.hasPressedShortcutInputs, "pause should clear pressed shortcut inputs")
    }

    private static func disabledConfigurationDoesNotStartBackend() throws {
        let backend = MockHotkeyBackend()
        let manager = HotkeyManager(backend: backend)

        try manager.register(configuration: .disabled)

        expect(backend.startCount == 0, "disabled configuration should not start backend")
        expect(manager.registrationState.phase == .disabled, "disabled configuration should be disabled")
        expect(manager.registrationState.reason == .noBindingEnabled, "disabled configuration should name missing bindings")
        expect(manager.registrationState.affectedBinding == .both, "disabled configuration should affect both bindings")
    }

    private static func holdSessionStartsAndStopsOnlyWhileHeld() {
        let controller = DictationShortcutSessionController()

        expect(
            controller.handle(event: .holdActivated, isTranscribing: false) == .start(.hold),
            "hold activation should start hold recording from idle"
        )
        expect(controller.activeMode == .hold, "hold activation should mark hold active")
        expect(
            controller.handle(event: .holdActivated, isTranscribing: false) == nil,
            "repeated hold activation should be ignored while held"
        )
        expect(
            controller.handle(event: .holdDeactivated, isTranscribing: false) == .stop,
            "hold release should stop active hold recording"
        )
        expect(controller.activeMode == nil, "hold release should reset active mode")
        expect(
            controller.handle(event: .holdDeactivated, isTranscribing: false) == nil,
            "extra hold release should be ignored from idle"
        )
    }

    private static func commandFnToggleStartsAndStopsWithoutHoldFallback() {
        let backend = MockHotkeyBackend()
        let manager = HotkeyManager(backend: backend)
        let controller = DictationShortcutSessionController()
        var actions: [DictationShortcutAction] = []
        manager.onShortcutEvent = { event in
            if let action = controller.handle(event: event, isTranscribing: false) {
                actions.append(action)
            }
        }

        try! manager.register(configuration: ShortcutConfiguration(hold: .defaultHold, toggle: .defaultToggle))

        backend.send(.modifierChanged(keyCode: 55, isDown: true))
        backend.send(.modifierChanged(keyCode: 63, isDown: true))
        expect(actions == [.start(.toggle)], "Command+Fn should start exactly one toggle session")

        backend.send(.modifierChanged(keyCode: 63, isDown: false))
        backend.send(.modifierChanged(keyCode: 55, isDown: false))
        expect(actions == [.start(.toggle)], "Command+Fn release should arm stop without stopping")

        backend.send(.modifierChanged(keyCode: 55, isDown: true))
        backend.send(.modifierChanged(keyCode: 63, isDown: true))
        expect(actions == [.start(.toggle), .stop], "second Command+Fn press should stop without starting hold")

        backend.send(.modifierChanged(keyCode: 63, isDown: false))
        backend.send(.modifierChanged(keyCode: 55, isDown: false))
        expect(actions == [.start(.toggle), .stop], "release after toggle stop should not emit another action")
    }

    private static func plainFnStopsActiveToggleWithoutStartingHold() {
        let backend = MockHotkeyBackend()
        let manager = HotkeyManager(backend: backend)
        let controller = DictationShortcutSessionController()
        var actions: [DictationShortcutAction] = []
        manager.onShortcutEvent = { event in
            if let action = controller.handle(event: event, isTranscribing: false) {
                actions.append(action)
            }
        }

        try! manager.register(configuration: ShortcutConfiguration(hold: .defaultHold, toggle: .defaultToggle))

        backend.send(.modifierChanged(keyCode: 55, isDown: true))
        backend.send(.modifierChanged(keyCode: 63, isDown: true))
        backend.send(.modifierChanged(keyCode: 63, isDown: false))
        backend.send(.modifierChanged(keyCode: 55, isDown: false))
        expect(actions == [.start(.toggle)], "Command+Fn should leave an active toggle session")

        backend.send(.modifierChanged(keyCode: 63, isDown: true))
        expect(actions == [.start(.toggle), .stop], "plain Fn should stop active toggle recording")

        backend.send(.modifierChanged(keyCode: 63, isDown: false))
        expect(actions == [.start(.toggle), .stop], "plain Fn release after toggle stop should not start hold")
    }

    private static func resetActiveSessionClearsHeldState() {
        let controller = DictationShortcutSessionController()

        expect(
            controller.handle(event: .holdActivated, isTranscribing: false) == .start(.hold),
            "hold activation should start before lifecycle reset"
        )
        expect(controller.resetActiveSession() == .hold, "reset should return the active mode it cleared")
        expect(controller.activeMode == nil, "reset should clear active mode")
        expect(
            controller.handle(event: .holdDeactivated, isTranscribing: false) == nil,
            "release after lifecycle reset should not emit another stop"
        )
        expect(
            controller.handle(event: .toggleActivated, isTranscribing: false) == .start(.toggle),
            "toggle activation should start before lifecycle reset"
        )
        expect(controller.resetActiveSession() == .toggle, "reset should return active toggle mode")
        expect(controller.activeMode == nil, "reset should clear active toggle mode")
        expect(
            controller.handle(event: .toggleActivated, isTranscribing: false) == .start(.toggle),
            "new toggle press after lifecycle reset should start a fresh toggle session"
        )
    }
}
