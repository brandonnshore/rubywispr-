import Foundation

enum HotkeyRecordingGateBlockReason: String, Equatable {
    case signedOut = "signed_out"
    case signInInProgress = "sign_in_in_progress"
    case accountRefreshing = "account_refreshing"
    case termsRequired = "terms_required"
    case accountIneligible = "account_ineligible"
    case accountUnavailable = "account_unavailable"
    case onboardingNotReady = "onboarding_not_ready"
    case setupIncomplete = "setup_incomplete"
    case microphoneUnavailable = "microphone_unavailable"
    case accessibilityUnavailable = "accessibility_unavailable"
    case recorderBusy = "recorder_busy"
    case uploadAmbiguous = "upload_ambiguous"
    case durationLimitReached = "duration_limit_reached"
}

enum HotkeyRecordingGateDecision: Equatable {
    case allowed
    case blocked(HotkeyRecordingGateBlockReason)

    var allowsRecording: Bool {
        self == .allowed
    }

    var blockedReason: HotkeyRecordingGateBlockReason? {
        guard case .blocked(let reason) = self else { return nil }
        return reason
    }
}

struct HotkeyRecordingGateSnapshot: Equatable {
    var authState: DesktopAuthCoordinatorState
    var onboardingStep: FirstRunOnboardingStep
    var hasCompletedSetup: Bool
    var microphoneStatus: FirstRunOnboardingPermissionCategory
    var accessibilityStatus: FirstRunOnboardingPermissionCategory
    var isRecording: Bool
    var isTranscribing: Bool
    var hasPendingRecordingStart: Bool
    var hasActiveTransientRecordingArtifact: Bool
    var durationState: RecordingDurationState
}

enum HotkeyRecordingGate {
    static func evaluateStart(_ snapshot: HotkeyRecordingGateSnapshot) -> HotkeyRecordingGateDecision {
        switch snapshot.authState.dictationAccountGateDecision {
        case .allowed:
            break
        case .signInRequired:
            return .blocked(.signedOut)
        case .signInInProgress:
            return .blocked(.signInInProgress)
        case .accountRefreshing:
            return .blocked(.accountRefreshing)
        case .termsRequired:
            return .blocked(.termsRequired)
        case .trialExhausted, .paymentFailed, .blocked:
            return .blocked(.accountIneligible)
        case .accountUnavailable:
            return .blocked(.accountUnavailable)
        }

        guard snapshot.onboardingStep.allowsNormalDictation else {
            return .blocked(.onboardingNotReady)
        }

        guard snapshot.hasCompletedSetup else {
            return .blocked(.setupIncomplete)
        }

        guard snapshot.microphoneStatus == .granted else {
            return .blocked(.microphoneUnavailable)
        }

        guard snapshot.accessibilityStatus == .granted else {
            return .blocked(.accessibilityUnavailable)
        }

        if snapshot.durationState == .capReached {
            return .blocked(.durationLimitReached)
        }

        if snapshot.isRecording || snapshot.isTranscribing || snapshot.hasPendingRecordingStart {
            return .blocked(.recorderBusy)
        }

        if snapshot.hasActiveTransientRecordingArtifact {
            return .blocked(.uploadAmbiguous)
        }

        return .allowed
    }
}
