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
}

@main
private struct HotkeyManagerTests {
    static func main() throws {
        try registersDefaultHoldAndToggle()
        try exposesRecoverableRegistrationFailureAndRetry()
        try pauseReleasesActiveShortcutState()
        try disabledConfigurationDoesNotStartBackend()

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
}
