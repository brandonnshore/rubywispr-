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
        mapsDirectInsertionResultsToIslandRecoveryStates()
        mapsSemanticStatesIntoFiveVisualStates()
        requiredRecoveryStatesHaveCompactCopyAndActions()
        exposesPrivacySafeSyntheticRecoveryProofStates()
        visualHarnessCoversEveryImplementedState()
        visualHarnessUsesOnlySyntheticSafeEvidenceSummaries()
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

    private static func mapsDirectInsertionResultsToIslandRecoveryStates() {
        let inserted = RecordingIslandStateMachine.directInsertionRecovery(for: insertionResult(
            state: .inserted,
            outcome: .directInsertionSucceeded,
            targetCategory: .plainTextEditor,
            localHistoryStatus: .inserted
        ))
        expect(inserted.state == .success, "known direct insertion should map to success")

        let unavailable = RecordingIslandStateMachine.directInsertionRecovery(for: insertionResult(
            state: .unavailable,
            outcome: .insertionUnavailable,
            reason: .noFocusedTarget,
            unsafeTargetCategory: .noFocusedTarget,
            localHistoryStatus: .insertionFailed
        ))
        expect(unavailable.state == .insertionUnavailable, "no focused target should map to insertion_unavailable")
        expect(unavailable.primaryAction == .copyCleanedText, "unavailable insertion should offer source-safe copy")
        expect(unavailable.secondaryAction == .retryInsertion, "unavailable insertion should allow retry after focusing a target")

        let copiedFallback = RecordingIslandStateMachine.fallbackCopied(after: insertionResult(
            state: .unavailable,
            outcome: .insertionUnavailable,
            reason: .noFocusedTarget,
            unsafeTargetCategory: .noFocusedTarget,
            localHistoryStatus: .insertionFailed
        ))
        expect(copiedFallback.state == .fallbackCopied, "automatic fallback copy should map to fallback_copied")
        expect(copiedFallback.title == "Copied to paste", "fallback copy should not claim insertion success")
        expect(copiedFallback.secondaryAction == .startNewWhisper, "copied fallback should expose a new-whisper exit")

        let failed = RecordingIslandStateMachine.directInsertionRecovery(for: insertionResult(
            state: .failed,
            outcome: .directInsertionFailed,
            reason: .deterministicFailure,
            targetCategory: .plainTextEditor,
            localHistoryStatus: .insertionFailed
        ))
        expect(failed.state == .insertionFailed, "deterministic insertion failure should map to insertion_failed")
        expect(failed.title == "Could not insert", "deterministic failure should not use unavailable-target copy")
        expect(failed.primaryAction == .copyCleanedText, "failed insertion should remain recoverable through copy")
        expect(failed.secondaryAction == .retryInsertion, "failed insertion should keep retry insertion available")

        let ambiguous = RecordingIslandStateMachine.directInsertionRecovery(for: insertionResult(
            state: .ambiguous,
            outcome: .directInsertionAmbiguous,
            reason: .targetAmbiguous,
            localHistoryStatus: .insertionFailed
        ))
        expect(ambiguous.state == .insertionFailed, "ambiguous insertion should not map to success")
        expect(ambiguous.title == "Insert unclear", "ambiguous insertion should be visibly distinct")
        expect(ambiguous.secondaryAction == .startNewWhisper, "ambiguous insertion should not offer blind same-target retry")

        let copiedAmbiguous = RecordingIslandStateMachine.fallbackCopied(after: insertionResult(
            state: .ambiguous,
            outcome: .directInsertionAmbiguous,
            reason: .attemptTimeout,
            targetCategory: .plainTextEditor,
            localHistoryStatus: .insertionFailed
        ))
        expect(copiedAmbiguous.state == .fallbackCopied, "copied ambiguous insertion should still expose fallback copy")
        expect(copiedAmbiguous.title == "Copied, check app", "copied ambiguous insertion should not claim success")
        expect(copiedAmbiguous.primaryAction == .copyCleanedText, "ambiguous copied fallback should keep copy recovery available")
        expect(copiedAmbiguous.secondaryAction == .startNewWhisper, "ambiguous copied fallback should expose new whisper")

        let permission = RecordingIslandStateMachine.directInsertionRecovery(for: insertionResult(
            state: .blocked,
            outcome: .insertionUnavailable,
            reason: .permissionDenied,
            permissionCategory: .denied,
            localHistoryStatus: .insertionFailed
        ))
        expect(permission.state == .insertionUnavailable, "permission-blocked final text should stay recoverable")
        expect(permission.primaryAction == .copyCleanedText, "permission-blocked insertion should offer copy")
        expect(permission.secondaryAction == .openSystemSettingsAccessibility, "permission-blocked insertion should offer Accessibility recovery")

        let duplicate = RecordingIslandStateMachine.directInsertionRecovery(for: insertionResult(
            state: .blocked,
            outcome: .insertionUnavailable,
            reason: .duplicateAttempt,
            localHistoryStatus: nil
        ))
        expect(duplicate.state == .unsafeRetryRequired, "duplicate in-flight insertion should require a new whisper")
        expect(duplicate.primaryAction == .startNewWhisper, "duplicate in-flight insertion should expose new whisper")
    }

    private static func mapsSemanticStatesIntoFiveVisualStates() {
        let visualStates = Set(RecordingIslandStateName.allCases.map(\.visualState))
        expect(
            visualStates == Set(RecordingIslandVisualState.allCases),
            "island semantic states should collapse into the five-state visual contract"
        )

        let expectedMappings: [(RecordingIslandStateName, RecordingIslandVisualState)] = [
            (.hiddenIdle, .idle),
            (.recordingHold, .listening),
            (.recordingToggle, .listening),
            (.nearingDurationLimit, .listening),
            (.processingUploading, .processing),
            (.inserting, .processing),
            (.success, .confirm),
            (.signedOut, .error),
            (.durationLimitReached, .error),
            (.fallbackCopied, .error),
            (.providerError, .error),
        ]

        for (state, visualState) in expectedMappings {
            let presentation = RecordingIslandStateMachine.syntheticPresentation(for: state)
            expect(state.visualState == visualState, "\(state.rawValue) should map to \(visualState.rawValue)")
            expect(presentation.visualState == visualState, "\(state.rawValue) presentation should expose \(visualState.rawValue)")
            expect(
                presentation.safeLogSummary.contains("visual_state=\(visualState.rawValue)"),
                "\(state.rawValue) safe summary should include visual state metadata"
            )
        }
    }

    private static func requiredRecoveryStatesHaveCompactCopyAndActions() {
        let requiredStates: Set<RecordingIslandStateName> = [
            .signedOut,
            .termsRequired,
            .trialExhausted,
            .paymentFailed,
            .microphoneRecovery,
            .accessibilityRecovery,
            .durationLimitReached,
            .insertionUnavailable,
            .fallbackCopied,
            .insertionFailed,
            .networkError,
            .providerError,
            .hotkeyUnavailable
        ]

        for state in requiredStates {
            let presentation = RecordingIslandStateMachine.syntheticPresentation(for: state)
            expect(presentation.isVisible, "\(state.rawValue) should be visible")
            expect(!presentation.title.isEmpty, "\(state.rawValue) should have user-facing copy")
            expect(presentation.title.count <= 24, "\(state.rawValue) copy should stay compact")
            expect(presentation.primaryAction != nil, "\(state.rawValue) should have a primary action")
            if let primaryAction = presentation.primaryAction {
                expect(!primaryAction.compactTitle.isEmpty, "\(state.rawValue) primary action should have a compact title")
                expect(primaryAction.compactTitle.count <= 8, "\(state.rawValue) action title should fit the island")
            }
        }

        let insertionFailed = RecordingIslandStateMachine.insertionFailed()
        expect(
            insertionFailed.title == "Could not insert",
            "deterministic insertion failure should not claim an unavailable target"
        )
        expect(
            insertionFailed.primaryAction == .copyCleanedText,
            "insertion failure should offer copy without rendering cleaned text"
        )
        expect(
            insertionFailed.secondaryAction == .retryInsertion,
            "insertion failure should offer retry insertion"
        )

        expect(
            RecordingIslandStateMachine.account(.trialExhausted).primaryAction == .openCheckout,
            "trial-exhausted accounts should route to checkout"
        )
        expect(
            RecordingIslandStateMachine.account(.paymentFailed).primaryAction == .openBilling,
            "payment-failed accounts should route to billing"
        )
        expect(
            RecordingIslandStateMachine.account(.signedOut).primaryAction == .openSignIn,
            "signed-out accounts should route to sign-in"
        )
    }

    private static func exposesPrivacySafeSyntheticRecoveryProofStates() {
        let proofStates = Set(RecordingIslandStateMachine.syntheticRecoveryProofStateNames)
        let expectedProofStates: Set<RecordingIslandStateName> = [
            .signedOut,
            .termsRequired,
            .trialExhausted,
            .paymentFailed,
            .accountBlocked,
            .microphoneRecovery,
            .accessibilityRecovery,
            .hotkeyUnavailable,
            .hotkeyConflict,
            .durationLimitReached,
            .insertionUnavailable,
            .fallbackCopied,
            .insertionFailed,
            .networkError,
            .providerError,
            .serviceError,
            .unsafeRetryRequired
        ]

        expect(
            proofStates == expectedProofStates,
            "synthetic recovery proof matrix should cover required private-safe recovery states"
        )

        for presentation in RecordingIslandStateMachine.syntheticRecoveryProofPresentations {
            let visibleProofText = [
                presentation.state.rawValue,
                presentation.title,
                presentation.primaryAction?.rawValue ?? "",
                presentation.primaryAction?.compactTitle ?? "",
                presentation.secondaryAction?.rawValue ?? "",
                presentation.secondaryAction?.compactTitle ?? "",
                presentation.safeLogSummary
            ].joined(separator: " ")

            expect(!visibleProofText.contains("PRIVATE_TRANSCRIPT"), "proof states must not contain transcripts")
            expect(!visibleProofText.contains("cleanedText"), "proof states must not contain cleaned text")
            expect(!visibleProofText.contains("@"), "proof states must not contain account emails")
            expect(!visibleProofText.contains("/Users/"), "proof states must not contain local paths")
            expect(!visibleProofText.contains("sk-"), "proof states must not contain token-like content")
        }
    }

    private static func visualHarnessCoversEveryImplementedState() {
        let matrix = RecordingIslandVisualTestHarness.screenshotMatrix
        let matrixStates = Set(matrix.map(\.state))
        let matrixIDs = Set(matrix.map(\.id))

        expect(
            matrixStates == Set(RecordingIslandStateName.allCases),
            "visual harness screenshot matrix should cover every implemented island state"
        )
        expect(
            matrixIDs.count == matrix.count,
            "visual harness scenario IDs should be unique"
        )
        expect(
            RecordingIslandVisualTestHarness.scenario(id: "ISLAND-010")?.state == .recordingHold,
            "visual harness should expose recording_hold by stable scenario ID"
        )
        expect(
            RecordingIslandVisualTestHarness.scenario(id: "ISLAND-011")?.state == .recordingToggle,
            "visual harness should expose recording_toggle by stable scenario ID"
        )
        expect(
            RecordingIslandVisualTestHarness.scenario(id: "ISLAND-000")?.isRunnableInDevHarness == false,
            "hidden_idle should remain written-proof-only because there is no island UI to capture"
        )

        for scenario in matrix where scenario.presentation.isVisible {
            expect(
                RecordingIslandVisualTestHarness.runnableScenarioIDs.contains(scenario.id),
                "\(scenario.id) should be runnable from the dev harness"
            )
        }

        for state in RecordingIslandStateMachine.syntheticRecoveryProofStateNames {
            expect(
                matrix.contains { $0.state == state && ($0.area == .recovery || $0.area == .privacy) },
                "\(state.rawValue) should remain in the visual proof recovery/privacy matrix"
            )
        }

        expect(
            RecordingIslandVisualTestHarness.scenario(id: "ISLAND-010")?.presentation.showsVisualizer == true,
            "recording_hold harness scenario should show the synthetic visualizer"
        )
        expect(
            RecordingIslandVisualTestHarness.scenario(id: "ISLAND-011")?.presentation.showsVisualizer == true,
            "recording_toggle harness scenario should show the synthetic visualizer"
        )
        expect(
            RecordingIslandVisualTestHarness.scenario(id: "ISLAND-021")?.presentation.showsVisualizer == false,
            "processing_uploading harness scenario should not show the visualizer"
        )
    }

    private static func visualHarnessUsesOnlySyntheticSafeEvidenceSummaries() {
        for scenario in RecordingIslandVisualTestHarness.screenshotMatrix {
            let proofText = [
                scenario.id,
                scenario.captureName,
                scenario.presentation.title,
                scenario.presentation.primaryAction?.rawValue ?? "",
                scenario.presentation.primaryAction?.compactTitle ?? "",
                scenario.presentation.secondaryAction?.rawValue ?? "",
                scenario.presentation.secondaryAction?.compactTitle ?? "",
                scenario.presentation.safeLogSummary,
                scenario.safeEvidenceSummary
            ].joined(separator: " ")

            for fragment in RecordingIslandVisualTestHarness.forbiddenEvidenceFragments {
                expect(
                    !proofText.contains(fragment),
                    "\(scenario.id) visual harness summary must not contain \(fragment)"
                )
            }

            expect(
                scenario.syntheticAudioLevel >= 0 && scenario.syntheticAudioLevel <= 1,
                "\(scenario.id) synthetic audio level should stay normalized"
            )
        }
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

    private static func insertionResult(
        state: DirectInsertionResultState,
        outcome: DirectInsertionOutcome,
        reason: DirectInsertionFailureReason? = nil,
        targetCategory: DirectInsertionTargetCategory? = nil,
        unsafeTargetCategory: DirectInsertionUnsafeTargetCategory? = nil,
        permissionCategory: DirectInsertionPermissionCategory = .trusted,
        localHistoryStatus: DirectInsertionLocalHistoryStatus?
    ) -> DirectInsertionResult {
        DirectInsertionResult(
            state: state,
            outcome: outcome,
            reason: reason,
            targetCategory: targetCategory,
            unsafeTargetCategory: unsafeTargetCategory,
            permissionCategory: permissionCategory,
            localHistoryStatus: localHistoryStatus
        )
    }
}
