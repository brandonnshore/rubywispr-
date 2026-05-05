import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

@main
private struct RecordingIslandStateMachineTests {
    static func main() {
        syntheticStatesCoverContract()
        mapsRecordingAndDurationStates()
        mapsGateFailuresWithoutStartingRecording()
        mapsAccountStates()
        mapsBackendFailuresToSafeRecoveryActions()
        keepsPrivateContentOutOfPresentation()

        print("RecordingIslandStateMachineTests passed")
    }

    private static func syntheticStatesCoverContract() {
        let generatedStates = Set(RecordingIslandStateName.allCases.map {
            RecordingIslandStateMachine.syntheticPresentation(for: $0).state
        })

        expect(
            generatedStates == Set(RecordingIslandStateName.allCases),
            "every RW-066 island state should have a synthetic/dev presentation"
        )
        expect(
            RecordingIslandStateMachine.syntheticPresentation(for: .hiddenIdle).isVisible == false,
            "hidden_idle should hide the island"
        )
        expect(
            RecordingIslandStateMachine.syntheticPresentation(for: .recordingHold).showsVisualizer,
            "recording states should allow visualizer rendering"
        )
        expect(
            !RecordingIslandStateMachine.syntheticPresentation(for: .processingUploading).showsVisualizer,
            "processing should not expose visualizer data"
        )
    }

    private static func mapsRecordingAndDurationStates() {
        expect(
            RecordingIslandStateMachine.recording(
                mode: .hold,
                durationSnapshot: durationSnapshot(state: .normal, mode: .hold)
            ).state == .recordingHold,
            "hold recording should map to recording_hold"
        )
        expect(
            RecordingIslandStateMachine.recording(
                mode: .toggle,
                durationSnapshot: durationSnapshot(state: .normal, mode: .toggle)
            ).state == .recordingToggle,
            "toggle recording should map to recording_toggle"
        )
        expect(
            RecordingIslandStateMachine.recording(
                mode: .toggle,
                durationSnapshot: durationSnapshot(state: .nearingLimit, mode: .toggle)
            ).state == .nearingDurationLimit,
            "duration warning should map to nearing_duration_limit"
        )
        expect(
            RecordingIslandStateMachine.recording(
                mode: .hold,
                durationSnapshot: durationSnapshot(state: .capReached, mode: .hold)
            ).primaryAction == .startNewWhisper,
            "duration cap should require a new whisper"
        )
    }

    private static func mapsGateFailuresWithoutStartingRecording() {
        expect(
            blocked(.signedOut, authState: .signedOut).state == .signedOut,
            "signed-out gate should map to signed_out"
        )
        expect(
            blocked(.accountIneligible, authState: .paymentFailed).state == .paymentFailed,
            "billing gate should map to payment_failed"
        )
        expect(
            blocked(.accountIneligible, authState: .blocked).primaryAction == .openAccount,
            "blocked account gate should open account recovery"
        )
        expect(
            blocked(.microphoneUnavailable).state == .microphoneRecovery,
            "microphone gate should map to microphone_recovery"
        )
        expect(
            blocked(.accessibilityUnavailable).primaryAction == .openSystemSettingsAccessibility,
            "accessibility gate should open Accessibility settings"
        )
        expect(
            blocked(.recorderBusy).state == .recorderBusy,
            "busy gate should not start a duplicate recording"
        )
        expect(
            blocked(.uploadAmbiguous).state == .unsafeRetryRequired,
            "ambiguous upload gate should prevent same-audio retry"
        )
    }

    private static func mapsAccountStates() {
        expect(
            RecordingIslandStateMachine.account(.accountRefreshing).state == .accountRefreshing,
            "account refresh should map to account_refreshing"
        )
        expect(
            RecordingIslandStateMachine.account(.signedInTermsRequired).primaryAction == .openTermsAcceptance,
            "Terms-required accounts should open Terms recovery"
        )
        expect(
            RecordingIslandStateMachine.account(.trialExhausted).state == .trialExhausted,
            "trial-exhausted accounts should map to trial_exhausted"
        )
        expect(
            RecordingIslandStateMachine.account(.paymentFailed).primaryAction == .openBilling,
            "payment-failed accounts should open billing"
        )
        expect(
            RecordingIslandStateMachine.account(.trialActive).state == .hiddenIdle,
            "eligible accounts alone should not display the island"
        )
    }

    private static func mapsBackendFailuresToSafeRecoveryActions() {
        let networkUnsafe = RecordingIslandStateMachine.uploadFailure(failure(
            code: .networkError,
            recovery: .retry,
            retryable: true,
            sameAudioRetryAllowed: false
        ))
        expect(networkUnsafe.state == .networkError, "network errors should map to network_error")
        expect(
            networkUnsafe.primaryAction == .startNewWhisper,
            "network retry should require new audio when same-audio retry is unsafe"
        )

        let providerSafe = RecordingIslandStateMachine.uploadFailure(failure(
            code: .providerError,
            recovery: .retry,
            retryable: true,
            sameAudioRetryAllowed: true
        ))
        expect(providerSafe.state == .providerError, "provider errors should map to provider_error")
        expect(providerSafe.primaryAction == .retry, "provider retry should be allowed only when marked safe")

        expect(
            RecordingIslandStateMachine.uploadFailure(failure(code: .rateLimited, recovery: .retryAfter)).state == .rateLimited,
            "rate-limited backend errors should map to rate_limited"
        )
        expect(
            RecordingIslandStateMachine.uploadFailure(failure(code: .invalidAudio, recovery: .recordAgain)).primaryAction == .recordAgain,
            "invalid audio should ask for a new recording"
        )
        expect(
            RecordingIslandStateMachine.uploadFailure(failure(code: .subscriptionRequired, recovery: .openCheckout)).state == .trialExhausted,
            "subscription_required should map to trial_exhausted recovery"
        )
        expect(
            RecordingIslandStateMachine.uploadFailure(failure(code: .internalError, recovery: .retryOrContactSupport)).state == .serviceError,
            "internal errors should map to service_error"
        )
    }

    private static func keepsPrivateContentOutOfPresentation() {
        let presentation = RecordingIslandStateMachine.uploadFailure(failure(
            code: .providerError,
            message: "PRIVATE_TRANSCRIPT secret-token@example.test",
            recovery: .retry,
            retryable: true,
            sameAudioRetryAllowed: false
        ))
        let combined = [presentation.title, presentation.safeLogSummary].joined(separator: " ")

        expect(!combined.contains("PRIVATE_TRANSCRIPT"), "island presentation must not include transcript content")
        expect(!combined.contains("secret-token"), "island presentation must not include secret-like content")
        expect(!combined.contains("@example.test"), "island presentation must not include account/email content")
    }

    private static func blocked(
        _ reason: HotkeyRecordingGateBlockReason,
        authState: DesktopAuthCoordinatorState = .trialActive,
        onboardingStep: FirstRunOnboardingStep = .ready
    ) -> RecordingIslandPresentation {
        RecordingIslandStateMachine.blockedHotkey(
            reason: reason,
            authState: authState,
            onboardingStep: onboardingStep
        )
    }

    private static func durationSnapshot(
        state: RecordingDurationState,
        mode: RecordingTriggerMode
    ) -> RecordingDurationSnapshot {
        RecordingDurationSnapshot(
            mode: mode,
            state: state,
            elapsedMs: state == .nearingLimit ? 570_000 : 10_000,
            durationWarningThresholdMs: 570_000,
            durationLimitMs: 600_000,
            elapsedBucket: state == .nearingLimit ? .warningWindow : .underWarning,
            policyCategory: .productionPolicy
        )
    }

    private static func failure(
        code: RubyWhisperBackendErrorCode,
        message: String? = nil,
        recovery: RubyWhisperDesktopRecoveryAction,
        retryable: Bool = false,
        sameAudioRetryAllowed: Bool = false
    ) -> RubyWhisperDesktopTranscriptionFailure {
        RubyWhisperDesktopTranscriptionFailure(
            error: RubyWhisperBackendError(
                code: code,
                requestId: "req_test",
                httpStatus: 400,
                message: message,
                recovery: recovery,
                desktopState: RubyWhisperBackendError.defaultMapping(code: code, statusCode: 400).desktopState,
                retryable: retryable
            ),
            sameAudioRetryAllowed: sameAudioRetryAllowed
        )
    }
}
