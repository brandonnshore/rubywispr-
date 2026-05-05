import Cocoa
import os.log

private let hotkeyLifecycleLog = OSLog(subsystem: "com.rubyadvisory.rubywhisper", category: "HotkeyLifecycle")

enum HotkeyBackendCaptureFailure: String, Equatable {
    case eventTapDisabledByTimeout
    case eventTapDisabledByUserInput
}

enum HotkeyRegistrationPhase: String, Equatable {
    case unregistered
    case registering
    case registered
    case degraded
    case disabled
}

enum HotkeyBindingCategory: String, Equatable {
    case hold
    case toggle
    case both
}

enum HotkeyRegistrationReason: String, Equatable {
    case none
    case paused
    case noBindingEnabled
    case holdBindingDisabled
    case toggleBindingDisabled
    case eventTapUnavailable
    case eventTapRunLoopSourceUnavailable
    case eventTapDisabledByTimeout
    case eventTapDisabledByUserInput
    case unknown
}

enum HotkeyLifecyclePauseReason: String, Equatable, Hashable {
    case onboardingBlocked
    case shortcutCapture
    case microphonePermissionPrompt
    case appQuit
    case logout
    case backendMigration
    case registrationFailureRecovery
}

protocol HotkeyBackending: AnyObject {
    var onInputEvent: ((ShortcutInputEvent) -> ShortcutConsumeDecision)? { get set }
    var onEscapeKeyPressed: (() -> Bool)? { get set }
    var onCaptureFailure: ((HotkeyBackendCaptureFailure) -> Void)? { get set }

    func start() throws
    func stop()
}

struct HotkeyRegistrationState: Equatable {
    let phase: HotkeyRegistrationPhase
    let reason: HotkeyRegistrationReason
    let affectedBinding: HotkeyBindingCategory?
    let isRecoverable: Bool

    static let unregistered = HotkeyRegistrationState(
        phase: .unregistered,
        reason: .none,
        affectedBinding: nil,
        isRecoverable: true
    )
}

final class HotkeyManager {
    private let backend: HotkeyBackending
    private var configuration = ShortcutConfiguration(
        hold: .defaultHold,
        toggle: .defaultToggle
    )
    private var inputState = ShortcutInputState()
    private var desiredConfiguration: ShortcutConfiguration?
    private var pauseReasons: Set<HotkeyLifecyclePauseReason> = []

    private(set) var registrationState = HotkeyRegistrationState.unregistered {
        didSet {
            guard registrationState != oldValue else { return }
            os_log(
                .info,
                log: hotkeyLifecycleLog,
                "hotkey registration phase=%{public}@ reason=%{public}@ affected=%{public}@ recoverable=%{public}@",
                registrationState.phase.rawValue,
                registrationState.reason.rawValue,
                registrationState.affectedBinding?.rawValue ?? "none",
                registrationState.isRecoverable.description
            )
            onRegistrationStateChanged?(registrationState)
        }
    }

    var onShortcutEvent: ((ShortcutEvent) -> Void)?
    var onEscapeKeyPressed: (() -> Bool)?
    var onRegistrationStateChanged: ((HotkeyRegistrationState) -> Void)?

    init(backend: HotkeyBackending = GlobalShortcutBackend()) {
        self.backend = backend
    }

    var currentPressedModifiers: ShortcutModifiers {
        inputState.currentModifiers
    }

    var hasPressedShortcutInputs: Bool {
        inputState.hasPressedShortcutInputs(configuration: configuration)
    }

    func start(configuration: ShortcutConfiguration) throws {
        try register(configuration: configuration)
    }

    func register(configuration: ShortcutConfiguration) throws {
        unregister(reason: nil)
        desiredConfiguration = configuration
        pauseReasons.removeAll()
        self.configuration = configuration
        let validatedState = registrationState(forValidated: configuration)

        guard validatedState.phase != .disabled else {
            registrationState = validatedState
            return
        }

        registrationState = HotkeyRegistrationState(
            phase: .registering,
            reason: .none,
            affectedBinding: nil,
            isRecoverable: true
        )
        backend.onInputEvent = { [weak self] event in
            self?.handleInputEvent(event) ?? .passthrough
        }
        backend.onEscapeKeyPressed = { [weak self] in
            self?.onEscapeKeyPressed?() ?? false
        }
        backend.onCaptureFailure = { [weak self] failure in
            self?.handleCaptureFailure(failure)
        }
        do {
            try backend.start()
            registrationState = validatedState
        } catch {
            backend.onInputEvent = nil
            backend.onEscapeKeyPressed = nil
            backend.onCaptureFailure = nil
            inputState = ShortcutInputState()
            registrationState = failedRegistrationState(for: error)
            throw error
        }
    }

    func stop() {
        unregister(reason: nil)
    }

    func unregister(reason: HotkeyLifecyclePauseReason?) {
        if let reason {
            pauseReasons.insert(reason)
        }
        backend.stop()
        backend.onInputEvent = nil
        backend.onEscapeKeyPressed = nil
        backend.onCaptureFailure = nil
        inputState = ShortcutInputState()
        registrationState = HotkeyRegistrationState(
            phase: reason == nil ? .unregistered : .disabled,
            reason: reason == nil ? .none : .paused,
            affectedBinding: nil,
            isRecoverable: reason != .appQuit
        )
    }

    func pause(reason: HotkeyLifecyclePauseReason) {
        unregister(reason: reason)
    }

    func resume(reason: HotkeyLifecyclePauseReason) throws {
        pauseReasons.remove(reason)
        guard pauseReasons.isEmpty else { return }
        guard let desiredConfiguration else { return }
        try register(configuration: desiredConfiguration)
    }

    func retryRegistration() throws {
        pauseReasons.remove(.registrationFailureRecovery)
        guard let desiredConfiguration else {
            registrationState = .unregistered
            return
        }
        try register(configuration: desiredConfiguration)
    }

    deinit {
        stop()
    }

    private func handleInputEvent(_ event: ShortcutInputEvent) -> ShortcutConsumeDecision {
        let result = ShortcutMatcher.reduce(
            state: inputState,
            event: event,
            configuration: configuration
        )
        inputState = result.state
        for event in result.emittedEvents {
            onShortcutEvent?(event)
        }
        return result.consumeDecision
    }

    private func handleCaptureFailure(_ failure: HotkeyBackendCaptureFailure) {
        backend.onInputEvent = nil
        backend.onEscapeKeyPressed = nil
        backend.onCaptureFailure = nil
        inputState = ShortcutInputState()
        pauseReasons.insert(.registrationFailureRecovery)

        registrationState = HotkeyRegistrationState(
            phase: .disabled,
            reason: registrationReason(for: failure),
            affectedBinding: .both,
            isRecoverable: true
        )
    }

    private func registrationState(forValidated configuration: ShortcutConfiguration) -> HotkeyRegistrationState {
        switch (configuration.hold.isDisabled, configuration.toggle.isDisabled) {
        case (true, true):
            return HotkeyRegistrationState(
                phase: .disabled,
                reason: .noBindingEnabled,
                affectedBinding: .both,
                isRecoverable: true
            )
        case (true, false):
            return HotkeyRegistrationState(
                phase: .degraded,
                reason: .holdBindingDisabled,
                affectedBinding: .hold,
                isRecoverable: true
            )
        case (false, true):
            return HotkeyRegistrationState(
                phase: .degraded,
                reason: .toggleBindingDisabled,
                affectedBinding: .toggle,
                isRecoverable: true
            )
        case (false, false):
            return HotkeyRegistrationState(
                phase: .registered,
                reason: .none,
                affectedBinding: nil,
                isRecoverable: true
            )
        }
    }

    private func failedRegistrationState(for error: Error) -> HotkeyRegistrationState {
        let reason: HotkeyRegistrationReason
        switch error {
        case GlobalShortcutBackendError.eventTapUnavailable:
            reason = .eventTapUnavailable
        case GlobalShortcutBackendError.eventTapRunLoopSourceUnavailable:
            reason = .eventTapRunLoopSourceUnavailable
        default:
            reason = .unknown
        }

        pauseReasons.insert(.registrationFailureRecovery)
        return HotkeyRegistrationState(
            phase: .disabled,
            reason: reason,
            affectedBinding: .both,
            isRecoverable: true
        )
    }

    private func registrationReason(for failure: HotkeyBackendCaptureFailure) -> HotkeyRegistrationReason {
        switch failure {
        case .eventTapDisabledByTimeout:
            return .eventTapDisabledByTimeout
        case .eventTapDisabledByUserInput:
            return .eventTapDisabledByUserInput
        }
    }
}
