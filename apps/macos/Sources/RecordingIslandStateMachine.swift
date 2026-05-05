import Foundation

enum RecordingIslandStateName: String, CaseIterable, Equatable, Codable {
    case hiddenIdle = "hidden_idle"
    case onboardingBlocked = "onboarding_blocked"
    case accountRefreshing = "account_refreshing"
    case signedOut = "signed_out"
    case termsRequired = "terms_required"
    case trialExhausted = "trial_exhausted"
    case paymentFailed = "payment_failed"
    case accountBlocked = "account_blocked"
    case microphoneRecovery = "microphone_recovery"
    case accessibilityRecovery = "accessibility_recovery"
    case hotkeyUnavailable = "hotkey_unavailable"
    case hotkeyConflict = "hotkey_conflict"
    case recorderBusy = "recorder_busy"
    case recordingHold = "recording_hold"
    case recordingToggle = "recording_toggle"
    case nearingDurationLimit = "nearing_duration_limit"
    case durationLimitReached = "duration_limit_reached"
    case processingUploading = "processing_uploading"
    case inserting
    case success
    case insertionFailed = "insertion_failed"
    case rateLimited = "rate_limited"
    case networkError = "network_error"
    case providerError = "provider_error"
    case invalidAudio = "invalid_audio"
    case serviceError = "service_error"
    case unsafeRetryRequired = "unsafe_retry_required"

    var isRecordingState: Bool {
        switch self {
        case .recordingHold, .recordingToggle, .nearingDurationLimit:
            return true
        case .hiddenIdle, .onboardingBlocked, .accountRefreshing, .signedOut,
             .termsRequired, .trialExhausted, .paymentFailed, .accountBlocked,
             .microphoneRecovery, .accessibilityRecovery, .hotkeyUnavailable,
             .hotkeyConflict, .recorderBusy, .durationLimitReached,
             .processingUploading, .inserting, .success, .insertionFailed,
             .rateLimited, .networkError, .providerError, .invalidAudio,
             .serviceError, .unsafeRetryRequired:
            return false
        }
    }

    var isProgressState: Bool {
        switch self {
        case .accountRefreshing, .processingUploading, .inserting:
            return true
        case .hiddenIdle, .onboardingBlocked, .signedOut, .termsRequired,
             .trialExhausted, .paymentFailed, .accountBlocked,
             .microphoneRecovery, .accessibilityRecovery, .hotkeyUnavailable,
             .hotkeyConflict, .recorderBusy, .recordingHold, .recordingToggle,
             .nearingDurationLimit, .durationLimitReached, .success,
             .insertionFailed, .rateLimited, .networkError, .providerError,
             .invalidAudio, .serviceError, .unsafeRetryRequired:
            return false
        }
    }

    var isRecoveryState: Bool {
        switch self {
        case .onboardingBlocked, .signedOut, .termsRequired, .trialExhausted,
             .paymentFailed, .accountBlocked, .microphoneRecovery,
             .accessibilityRecovery, .hotkeyUnavailable, .hotkeyConflict,
             .recorderBusy, .durationLimitReached, .insertionFailed,
             .rateLimited, .networkError, .providerError, .invalidAudio,
             .serviceError, .unsafeRetryRequired:
            return true
        case .hiddenIdle, .accountRefreshing, .recordingHold, .recordingToggle,
             .nearingDurationLimit, .processingUploading, .inserting, .success:
            return false
        }
    }
}

enum RecordingIslandAction: String, Equatable, Codable {
    case stopRecording = "stop_recording"
    case cancelIfSafe = "cancel_if_safe"
    case waitOrCancel = "wait_or_cancel"
    case openOnboardingStep = "open_onboarding_step"
    case openSignIn = "open_sign_in"
    case openTermsAcceptance = "open_terms_acceptance"
    case openCheckout = "open_checkout"
    case openBilling = "open_billing"
    case openAccount = "open_account"
    case openSystemSettingsMicrophone = "open_system_settings_microphone"
    case openSystemSettingsAccessibility = "open_system_settings_accessibility"
    case openHotkeySettings = "open_hotkey_settings"
    case retryHotkeyRegistration = "retry_hotkey_registration"
    case retryAfter = "retry_after"
    case retry
    case retryInsertion = "retry_insertion"
    case copyCleanedText = "copy_cleaned_text"
    case recordAgain = "record_again"
    case startNewWhisper = "start_new_whisper"
    case retryOrContactSupport = "retry_or_contact_support"
}

struct RecordingIslandPresentation: Equatable {
    var state: RecordingIslandStateName
    var title: String
    var systemImageName: String
    var primaryAction: RecordingIslandAction?
    var secondaryAction: RecordingIslandAction?
    var isVisible: Bool
    var showsVisualizer: Bool
    var allowsSameAudioRetry: Bool

    var usesRecoveryLayout: Bool {
        state.isRecoveryState
    }

    var safeLogSummary: String {
        [
            "island_state=\(state.rawValue)",
            "primary_action=\(primaryAction?.rawValue ?? "none")",
            "same_audio_retry=\(allowsSameAudioRetry)"
        ].joined(separator: " ")
    }
}

enum RecordingIslandStateMachine {
    static func hiddenIdle() -> RecordingIslandPresentation {
        presentation(for: .hiddenIdle)
    }

    static func syntheticPresentation(for state: RecordingIslandStateName) -> RecordingIslandPresentation {
        presentation(for: state)
    }

    static func recording(
        mode: RecordingTriggerMode,
        durationSnapshot: RecordingDurationSnapshot
    ) -> RecordingIslandPresentation {
        if durationSnapshot.state == .nearingLimit {
            return presentation(for: .nearingDurationLimit, primaryAction: .stopRecording)
        }

        if durationSnapshot.state == .capReached {
            return presentation(for: .durationLimitReached, primaryAction: .startNewWhisper)
        }

        switch mode {
        case .hold:
            return presentation(for: .recordingHold, primaryAction: .stopRecording)
        case .toggle:
            return presentation(for: .recordingToggle, primaryAction: .stopRecording)
        }
    }

    static func processingUpload() -> RecordingIslandPresentation {
        presentation(for: .processingUploading, primaryAction: .cancelIfSafe)
    }

    static func inserting() -> RecordingIslandPresentation {
        presentation(for: .inserting)
    }

    static func success() -> RecordingIslandPresentation {
        presentation(for: .success)
    }

    static func insertionFailed() -> RecordingIslandPresentation {
        presentation(
            for: .insertionFailed,
            primaryAction: .copyCleanedText,
            secondaryAction: .retryInsertion
        )
    }

    static func unsafeRetryRequired() -> RecordingIslandPresentation {
        presentation(for: .unsafeRetryRequired, primaryAction: .startNewWhisper)
    }

    static func account(_ state: DesktopAuthCoordinatorState) -> RecordingIslandPresentation {
        switch state.dictationAccountGateDecision {
        case .allowed:
            return hiddenIdle()
        case .signInRequired:
            return presentation(for: .signedOut, primaryAction: .openSignIn)
        case .signInInProgress, .accountRefreshing:
            return presentation(for: .accountRefreshing, primaryAction: .waitOrCancel)
        case .termsRequired:
            return presentation(for: .termsRequired, primaryAction: .openTermsAcceptance)
        case .trialExhausted:
            return presentation(for: .trialExhausted, primaryAction: .openCheckout)
        case .paymentFailed:
            return presentation(for: .paymentFailed, primaryAction: .openBilling)
        case .blocked:
            return presentation(for: .accountBlocked, primaryAction: .openAccount)
        case .accountUnavailable:
            return presentation(for: .serviceError, primaryAction: .retryOrContactSupport)
        }
    }

    static func blockedHotkey(
        reason: HotkeyRecordingGateBlockReason,
        authState: DesktopAuthCoordinatorState,
        onboardingStep: FirstRunOnboardingStep
    ) -> RecordingIslandPresentation {
        switch reason {
        case .signedOut:
            return presentation(for: .signedOut, primaryAction: .openSignIn)
        case .signInInProgress, .accountRefreshing:
            return presentation(for: .accountRefreshing, primaryAction: .waitOrCancel)
        case .termsRequired:
            return presentation(for: .termsRequired, primaryAction: .openTermsAcceptance)
        case .accountIneligible:
            return accountIneligible(authState)
        case .accountUnavailable:
            return presentation(for: .serviceError, primaryAction: .retryOrContactSupport)
        case .onboardingNotReady, .setupIncomplete:
            return onboardingBlocked(onboardingStep: onboardingStep)
        case .microphoneUnavailable:
            return presentation(for: .microphoneRecovery, primaryAction: .openSystemSettingsMicrophone)
        case .accessibilityUnavailable:
            return presentation(for: .accessibilityRecovery, primaryAction: .openSystemSettingsAccessibility)
        case .recorderBusy:
            return presentation(for: .recorderBusy)
        case .uploadAmbiguous:
            return unsafeRetryRequired()
        case .durationLimitReached:
            return presentation(for: .durationLimitReached, primaryAction: .startNewWhisper)
        }
    }

    static func uploadFailure(_ failure: RubyWhisperDesktopTranscriptionFailure) -> RecordingIslandPresentation {
        let state = stateName(for: failure)
        let action = action(
            for: failure.recovery,
            retryable: failure.retryable,
            sameAudioRetryAllowed: failure.sameAudioRetryAllowed
        )
        return presentation(
            for: state,
            primaryAction: action,
            allowsSameAudioRetry: failure.sameAudioRetryAllowed
        )
    }

    static func accountSnapshotError(_ snapshot: RubyWhisperDesktopAccountSnapshot) -> RecordingIslandPresentation {
        switch snapshot.state {
        case .signedOut:
            return presentation(for: .signedOut, primaryAction: .openSignIn)
        case .signedInTermsRequired:
            return presentation(for: .termsRequired, primaryAction: .openTermsAcceptance)
        case .trialExhausted:
            return presentation(for: .trialExhausted, primaryAction: .openCheckout)
        case .paymentFailed:
            return presentation(for: .paymentFailed, primaryAction: .openBilling)
        case .blocked:
            return presentation(for: .accountBlocked, primaryAction: .openAccount)
        case .durationLimitReached:
            return presentation(for: .durationLimitReached, primaryAction: .startNewWhisper)
        case .providerError:
            return presentation(for: .providerError, primaryAction: .startNewWhisper)
        case .networkError:
            return presentation(for: .networkError, primaryAction: .startNewWhisper)
        case .error, .unknown:
            return presentation(for: .serviceError, primaryAction: .retryOrContactSupport)
        case .trialActive, .paidActive, .friendOfRubyActive:
            return hiddenIdle()
        }
    }

    private static func onboardingBlocked(
        onboardingStep: FirstRunOnboardingStep
    ) -> RecordingIslandPresentation {
        switch onboardingStep {
        case .microphoneRequired, .microphoneRequesting, .microphoneRecovery:
            return presentation(for: .microphoneRecovery, primaryAction: .openSystemSettingsMicrophone)
        case .accessibilityRequired, .accessibilityRequesting, .accessibilityRecovery:
            return presentation(for: .accessibilityRecovery, primaryAction: .openSystemSettingsAccessibility)
        case .signInRequired, .signInInProgress:
            return presentation(for: .signedOut, primaryAction: .openSignIn)
        case .accountRefreshing:
            return presentation(for: .accountRefreshing, primaryAction: .waitOrCancel)
        case .termsRequired:
            return presentation(for: .termsRequired, primaryAction: .openTermsAcceptance)
        case .accountIneligible:
            return presentation(for: .trialExhausted, primaryAction: .openCheckout)
        case .notStarted, .testWhisperRequired, .testWhisperRecording,
             .testWhisperProcessing, .ready:
            return presentation(for: .onboardingBlocked, primaryAction: .openOnboardingStep)
        }
    }

    private static func accountIneligible(
        _ authState: DesktopAuthCoordinatorState
    ) -> RecordingIslandPresentation {
        switch authState {
        case .paymentFailed:
            return presentation(for: .paymentFailed, primaryAction: .openBilling)
        case .blocked:
            return presentation(for: .accountBlocked, primaryAction: .openAccount)
        case .trialExhausted:
            return presentation(for: .trialExhausted, primaryAction: .openCheckout)
        case .signedOut, .loginLaunching, .browserPending, .handoffPending,
             .sessionExchanging, .accountRefreshing, .signedInTermsRequired,
             .trialActive, .paidActive, .friendOfRubyActive, .canceled, .error,
             .unknown:
            return presentation(for: .trialExhausted, primaryAction: .openCheckout)
        }
    }

    private static func stateName(
        for failure: RubyWhisperDesktopTranscriptionFailure
    ) -> RecordingIslandStateName {
        switch failure.code {
        case .signedOut:
            return .signedOut
        case .termsRequired:
            return .termsRequired
        case .trialExhausted, .subscriptionRequired:
            return .trialExhausted
        case .paymentFailed:
            return .paymentFailed
        case .accountBlocked:
            return .accountBlocked
        case .rateLimited:
            return .rateLimited
        case .durationLimitReached:
            return .durationLimitReached
        case .invalidAudio:
            return .invalidAudio
        case .providerError:
            return .providerError
        case .networkError:
            return .networkError
        case .serviceUnavailable, .internalError, .unknown:
            return .serviceError
        }
    }

    private static func action(
        for recovery: RubyWhisperDesktopRecoveryAction,
        retryable: Bool,
        sameAudioRetryAllowed: Bool
    ) -> RecordingIslandAction {
        switch recovery {
        case .openSignIn:
            return .openSignIn
        case .openTermsAcceptance:
            return .openTermsAcceptance
        case .openCheckout:
            return .openCheckout
        case .openBilling:
            return .openBilling
        case .openAccount:
            return .openAccount
        case .retryAfter:
            return sameAudioRetryAllowed ? .retryAfter : .startNewWhisper
        case .startNewWhisper:
            return .startNewWhisper
        case .recordAgain:
            return .recordAgain
        case .retry:
            return sameAudioRetryAllowed ? .retry : .startNewWhisper
        case .retryOrContactSupport:
            guard retryable else { return .retryOrContactSupport }
            return sameAudioRetryAllowed ? .retryOrContactSupport : .startNewWhisper
        case .unknown:
            return .retryOrContactSupport
        }
    }

    private static func presentation(
        for state: RecordingIslandStateName,
        primaryAction: RecordingIslandAction? = nil,
        secondaryAction: RecordingIslandAction? = nil,
        allowsSameAudioRetry: Bool = false
    ) -> RecordingIslandPresentation {
        let defaults = defaultPresentation(for: state)
        return RecordingIslandPresentation(
            state: state,
            title: defaults.title,
            systemImageName: defaults.systemImageName,
            primaryAction: primaryAction ?? defaults.primaryAction,
            secondaryAction: secondaryAction ?? defaults.secondaryAction,
            isVisible: state != .hiddenIdle,
            showsVisualizer: state.isRecordingState,
            allowsSameAudioRetry: allowsSameAudioRetry
        )
    }

    private static func defaultPresentation(
        for state: RecordingIslandStateName
    ) -> (title: String, systemImageName: String, primaryAction: RecordingIslandAction?, secondaryAction: RecordingIslandAction?) {
        switch state {
        case .hiddenIdle:
            return ("", "circle", nil, nil)
        case .onboardingBlocked:
            return ("Complete setup", "checklist", .openOnboardingStep, nil)
        case .accountRefreshing:
            return ("Loading account", "arrow.triangle.2.circlepath", .waitOrCancel, nil)
        case .signedOut:
            return ("Sign in required", "person.crop.circle.badge.xmark", .openSignIn, nil)
        case .termsRequired:
            return ("Accept Terms", "doc.text.fill", .openTermsAcceptance, nil)
        case .trialExhausted:
            return ("Trial exhausted", "creditcard.fill", .openCheckout, nil)
        case .paymentFailed:
            return ("Update billing", "creditcard.trianglebadge.exclamationmark", .openBilling, nil)
        case .accountBlocked:
            return ("Account blocked", "exclamationmark.triangle.fill", .openAccount, nil)
        case .microphoneRecovery:
            return ("Microphone access", "mic.slash.fill", .openSystemSettingsMicrophone, nil)
        case .accessibilityRecovery:
            return ("Accessibility access", "cursorarrow.motionlines", .openSystemSettingsAccessibility, nil)
        case .hotkeyUnavailable:
            return ("Hotkey unavailable", "keyboard.badge.exclamationmark", .openHotkeySettings, nil)
        case .hotkeyConflict:
            return ("Hotkey conflict", "keyboard.badge.exclamationmark", .retryHotkeyRegistration, nil)
        case .recorderBusy:
            return ("Already working", "waveform", nil, nil)
        case .recordingHold:
            return ("Recording", "waveform", .stopRecording, nil)
        case .recordingToggle:
            return ("Recording", "waveform", .stopRecording, nil)
        case .nearingDurationLimit:
            return ("Time limit soon", "timer", .stopRecording, nil)
        case .durationLimitReached:
            return ("Duration limit", "timer", .startNewWhisper, nil)
        case .processingUploading:
            return ("Processing", "arrow.up.circle.fill", .cancelIfSafe, nil)
        case .inserting:
            return ("Inserting", "text.cursor", nil, nil)
        case .success:
            return ("Done", "checkmark", nil, nil)
        case .insertionFailed:
            return ("Click a text box first.", "text.cursor", .copyCleanedText, .retryInsertion)
        case .rateLimited:
            return ("Rate limited", "hourglass", .retryAfter, nil)
        case .networkError:
            return ("Network error", "wifi.exclamationmark", .startNewWhisper, nil)
        case .providerError:
            return ("Transcription unavailable", "waveform.badge.exclamationmark", .startNewWhisper, nil)
        case .invalidAudio:
            return ("Record again", "waveform.slash", .recordAgain, nil)
        case .serviceError:
            return ("Service unavailable", "exclamationmark.triangle.fill", .retryOrContactSupport, nil)
        case .unsafeRetryRequired:
            return ("Record again", "arrow.clockwise.circle", .startNewWhisper, nil)
        }
    }
}
