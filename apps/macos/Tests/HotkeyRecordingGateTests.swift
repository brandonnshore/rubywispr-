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
private struct HotkeyRecordingGateTests {
    static func main() {
        blocksAccountAndOnboardingStatesBeforeRecording()
        allowsOnlyReadyIdleState()
        blocksPermissionRegressionsEvenIfOnboardingLooksReady()
        blocksProcessingUploadAndAmbiguousArtifactStates()
        blocksDurationCapBeforeAnotherCapture()

        print("HotkeyRecordingGateTests passed")
    }

    private static func blocksAccountAndOnboardingStatesBeforeRecording() {
        expect(
            decision(authState: .signedOut) == .blocked(.signedOut),
            "signed out hotkeys should open sign-in recovery instead of recording"
        )
        expect(
            decision(authState: .signedInTermsRequired) == .blocked(.termsRequired),
            "Terms-required hotkeys should route to account recovery"
        )
        expect(
            decision(authState: .paymentFailed) == .blocked(.accountIneligible),
            "billing failure should block recording"
        )
        expect(
            decision(onboardingStep: .microphoneRecovery) == .blocked(.onboardingNotReady),
            "non-ready onboarding should block before local capture"
        )
    }

    private static func allowsOnlyReadyIdleState() {
        expect(decision() == .allowed, "ready, idle, fully permitted state should allow recording")
    }

    private static func blocksPermissionRegressionsEvenIfOnboardingLooksReady() {
        expect(
            decision(microphoneStatus: .denied) == .blocked(.microphoneUnavailable),
            "microphone regression should block even if onboarding cache is ready"
        )
        expect(
            decision(accessibilityStatus: .denied) == .blocked(.accessibilityUnavailable),
            "Accessibility regression should block even if onboarding cache is ready"
        )
    }

    private static func blocksProcessingUploadAndAmbiguousArtifactStates() {
        expect(
            decision(isRecording: true) == .blocked(.recorderBusy),
            "active recording should block duplicate starts"
        )
        expect(
            decision(isTranscribing: true) == .blocked(.recorderBusy),
            "processing/upload should block duplicate starts"
        )
        expect(
            decision(hasPendingRecordingStart: true) == .blocked(.recorderBusy),
            "delayed hotkey start should block a second start"
        )
        expect(
            decision(hasActiveTransientRecordingArtifact: true) == .blocked(.uploadAmbiguous),
            "leftover transient audio should block same-artifact retry ambiguity"
        )
    }

    private static func blocksDurationCapBeforeAnotherCapture() {
        expect(
            decision(durationState: .capReached) == .blocked(.durationLimitReached),
            "duration cap state should block capture until the current whisper is cleaned up"
        )
    }

    private static func decision(
        authState: DesktopAuthCoordinatorState = .trialActive,
        onboardingStep: FirstRunOnboardingStep = .ready,
        hasCompletedSetup: Bool = true,
        microphoneStatus: FirstRunOnboardingPermissionCategory = .granted,
        accessibilityStatus: FirstRunOnboardingPermissionCategory = .granted,
        isRecording: Bool = false,
        isTranscribing: Bool = false,
        hasPendingRecordingStart: Bool = false,
        hasActiveTransientRecordingArtifact: Bool = false,
        durationState: RecordingDurationState = .inactive
    ) -> HotkeyRecordingGateDecision {
        HotkeyRecordingGate.evaluateStart(HotkeyRecordingGateSnapshot(
            authState: authState,
            onboardingStep: onboardingStep,
            hasCompletedSetup: hasCompletedSetup,
            microphoneStatus: microphoneStatus,
            accessibilityStatus: accessibilityStatus,
            isRecording: isRecording,
            isTranscribing: isTranscribing,
            hasPendingRecordingStart: hasPendingRecordingStart,
            hasActiveTransientRecordingArtifact: hasActiveTransientRecordingArtifact,
            durationState: durationState
        ))
    }
}
