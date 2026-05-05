import Darwin
import AVFoundation
import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

private final class MemoryOnboardingMetadataStore: FirstRunOnboardingMetadataStoring {
    private(set) var storedMetadata: FirstRunOnboardingMetadata?
    private(set) var saveCount = 0
    private(set) var resetCount = 0

    func load() -> FirstRunOnboardingMetadata? {
        storedMetadata
    }

    func save(_ metadata: FirstRunOnboardingMetadata) {
        saveCount += 1
        storedMetadata = metadata
    }

    func reset() {
        resetCount += 1
        storedMetadata = nil
    }
}

@main
private struct FirstRunOnboardingCoordinatorTests {
    static func main() {
        testFirstRunStartsAtSignInAndBlocksDictation()
        testPartialCompletionStopsAtFirstUnsatisfiedGate()
        testReadyRequiresEveryGate()
        testAccessibilityRequestAndRecoveryBlockTestWhisper()
        testResetReplaysOnboarding()
        testBlockedStatesWinOverLaterSignals()
        testMicrophonePermissionGatePresentsRecoveryWithoutPrivateData()
        testStoredMetadataUsesOnlySanitizedCategories()
        print("FirstRunOnboardingCoordinatorTests passed")
    }

    private static func testFirstRunStartsAtSignInAndBlocksDictation() {
        let store = MemoryOnboardingMetadataStore()
        let coordinator = makeCoordinator(store: store)

        let step = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .signedOut,
            microphoneStatus: .notDetermined,
            accessibilityStatus: .notDetermined
        ))

        expect(step == .signInRequired, "clean first run should ask for sign-in first")
        expect(!coordinator.canEnterReady, "clean first run must not be ready")
        expect(!coordinator.currentStep.allowsNormalDictation, "non-ready steps must block normal dictation")
        expect(coordinator.metadata.completedSteps.isEmpty, "clean first run should have no completed gates")
        expect(store.saveCount == 1, "state evaluation should persist sanitized progress hints")
    }

    private static func testPartialCompletionStopsAtFirstUnsatisfiedGate() {
        let store = MemoryOnboardingMetadataStore()
        let coordinator = makeCoordinator(store: store)

        let step = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .granted,
            accessibilityStatus: .notDetermined
        ))

        expect(step == .accessibilityRequired, "active account and microphone should stop at Accessibility")
        expect(coordinator.metadata.lastAccountCategory == .trialActive, "metadata may store active account category")
        expect(coordinator.metadata.lastMicrophoneStatus == .granted, "metadata may store microphone category")
        expect(coordinator.metadata.completedSteps.contains(.microphoneRequired), "granted microphone should be completed")
        expect(!coordinator.metadata.completedSteps.contains(.accessibilityRequired), "missing Accessibility should not be completed")
        expect(coordinator.metadata.onboardingCompletedAt == nil, "partial completion must not store completion timestamp")
    }

    private static func testReadyRequiresEveryGate() {
        let store = MemoryOnboardingMetadataStore()
        let coordinator = makeCoordinator(store: store)

        let blockedBeforeTest = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .paidActive,
            microphoneStatus: .granted,
            accessibilityStatus: .granted,
            testWhisperStatus: .notStarted
        ))

        expect(blockedBeforeTest == .testWhisperRequired, "ready should wait for test whisper")
        expect(!coordinator.canEnterReady, "ready should be false before test whisper succeeds")

        let ready = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .paidActive,
            microphoneStatus: .granted,
            accessibilityStatus: .granted,
            testWhisperStatus: .succeeded
        ))

        expect(ready == .ready, "all gates should enter ready")
        expect(coordinator.canEnterReady, "all gates should allow ready")
        expect(coordinator.metadata.testWhisperCompleted, "ready should persist test whisper completion flag")
        expect(coordinator.metadata.onboardingCompletedAt != nil, "ready should persist completion timestamp")
        expect(coordinator.metadata.completedAppVersion == "1.2.3", "ready should persist app version")
        expect(coordinator.metadata.completedAppBuild == "456", "ready should persist app build")
    }

    private static func testAccessibilityRequestAndRecoveryBlockTestWhisper() {
        let coordinator = makeCoordinator()

        let requesting = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .granted,
            accessibilityStatus: .requesting,
            testWhisperStatus: .succeeded
        ))
        expect(requesting == .accessibilityRequesting, "requesting Accessibility should wait before test whisper")
        expect(!coordinator.canEnterReady, "requesting Accessibility must not be ready")
        expect(!coordinator.metadata.testWhisperCompleted, "test whisper success cannot count while Accessibility is requesting")

        let denied = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .granted,
            accessibilityStatus: .denied,
            testWhisperStatus: .succeeded
        ))
        expect(denied == .accessibilityRecovery, "denied Accessibility should enter recovery")
        expect(coordinator.metadata.lastAccessibilityStatus == .denied, "metadata may store denied category only")
        expect(!FirstRunOnboardingCoordinator.canStartTestWhisper(from: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .granted,
            accessibilityStatus: .denied
        )), "test whisper should be blocked until Accessibility is granted")
    }

    private static func testResetReplaysOnboarding() {
        let store = MemoryOnboardingMetadataStore()
        let coordinator = makeCoordinator(store: store)

        _ = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .friendOfRubyActive,
            microphoneStatus: .granted,
            accessibilityStatus: .granted,
            testWhisperStatus: .succeeded
        ))
        expect(coordinator.currentStep == .ready, "precondition should be ready")

        coordinator.resetForQA()

        expect(coordinator.currentStep == .notStarted, "reset should clear current state")
        expect(coordinator.metadata == FirstRunOnboardingMetadata(), "reset should clear metadata")
        expect(store.resetCount == 1, "reset should clear persisted metadata")

        let replay = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .signedOut,
            microphoneStatus: .notDetermined,
            accessibilityStatus: .notDetermined
        ))
        expect(replay == .signInRequired, "clean replay should start at sign-in")
    }

    private static func testBlockedStatesWinOverLaterSignals() {
        let coordinator = makeCoordinator()

        let terms = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .signedInTermsRequired,
            microphoneStatus: .granted,
            accessibilityStatus: .granted,
            testWhisperStatus: .succeeded
        ))
        expect(terms == .termsRequired, "Terms gate should block later local signals")
        expect(!coordinator.metadata.testWhisperCompleted, "test whisper success cannot count before Terms")

        let ineligible = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .paymentFailed,
            microphoneStatus: .granted,
            accessibilityStatus: .granted,
            testWhisperStatus: .succeeded
        ))
        expect(ineligible == .accountIneligible, "account ineligibility should block ready")

        let microphoneDenied = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .denied,
            accessibilityStatus: .granted,
            testWhisperStatus: .succeeded
        ))
        expect(microphoneDenied == .microphoneRecovery, "denied microphone should enter recovery")

        let accessibilityDenied = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .granted,
            accessibilityStatus: .denied,
            testWhisperStatus: .succeeded
        ))
        expect(accessibilityDenied == .accessibilityRecovery, "denied Accessibility should enter recovery")

        let canStartTest = FirstRunOnboardingCoordinator.canStartTestWhisper(from: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .restricted,
            accessibilityStatus: .granted
        ))
        expect(!canStartTest, "test whisper should be blocked until local gates pass")
    }

    private static func testStoredMetadataUsesOnlySanitizedCategories() {
        let store = MemoryOnboardingMetadataStore()
        let coordinator = makeCoordinator(store: store)

        _ = coordinator.update(with: FirstRunOnboardingGateSnapshot(
            authState: .trialActive,
            microphoneStatus: .granted,
            accessibilityStatus: .granted,
            testWhisperStatus: .succeeded
        ))

        guard let metadata = store.storedMetadata else {
            expect(false, "metadata should be saved")
            return
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try! encoder.encode(metadata)
        let serialized = String(data: data, encoding: .utf8)!
        let forbiddenFragments = [
            "tok" + "en",
            "Bearer",
            "Authorization",
            "@example",
            "audio",
            "transcript",
            "clipboard",
            "selected_text",
            "provider_payload",
            "magic_link"
        ]

        for fragment in forbiddenFragments {
            expect(!serialized.contains(fragment), "metadata should not contain private fragment \(fragment)")
        }
        expect(serialized.contains("trial_active"), "metadata should contain only account category")
        expect(serialized.contains("granted"), "metadata should contain permission categories")
    }

    private static func testMicrophonePermissionGatePresentsRecoveryWithoutPrivateData() {
        let granted = MicrophonePermissionGate.category(
            from: .authorized,
            hasInputDevice: true
        )
        expect(granted == .granted, "authorized microphone with input should be granted")

        let unavailable = MicrophonePermissionGate.category(
            from: .authorized,
            hasInputDevice: false
        )
        expect(unavailable == .unavailable, "authorized microphone without input should be unavailable")

        let deniedPresentation = MicrophonePermissionGate.presentation(for: .denied)
        expect(!deniedPresentation.canProceed, "denied microphone should block progression")
        expect(deniedPresentation.primaryAction == .openSystemSettings, "denied microphone should recover through settings")
        expect(deniedPresentation.showsRecoveryPath, "denied microphone should show written recovery path")

        let waitingPresentation = MicrophonePermissionGate.presentation(for: .requesting)
        expect(!waitingPresentation.canProceed, "requesting microphone should wait for macOS")
        expect(waitingPresentation.primaryAction == .none, "requesting microphone should not start recording")

        let serialized = [
            deniedPresentation.category.rawValue,
            deniedPresentation.statusLabel,
            deniedPresentation.primaryAction.rawValue,
            MicrophonePermissionGate.recoveryPath
        ].joined(separator: " ")
        let forbiddenFragments = [
            "tok" + "en",
            "Bearer",
            "Authorization",
            "@example",
            "audio",
            "transcript",
            "clipboard",
            "selected_text",
            "provider_payload",
            "magic_link",
            "MacBook",
            "uid="
        ]

        for fragment in forbiddenFragments {
            expect(!serialized.contains(fragment), "permission evidence should not contain private fragment \(fragment)")
        }
    }

    private static func makeCoordinator(
        store: MemoryOnboardingMetadataStore = MemoryOnboardingMetadataStore()
    ) -> FirstRunOnboardingCoordinator {
        FirstRunOnboardingCoordinator(
            metadataStore: store,
            appVersionProvider: { "1.2.3" },
            appBuildProvider: { "456" },
            now: { Date(timeIntervalSince1970: 1_775_000_000) }
        )
    }
}
