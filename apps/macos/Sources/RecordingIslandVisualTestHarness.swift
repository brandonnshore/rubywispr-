import Foundation

enum RecordingIslandVisualHarnessArea: String, CaseIterable, Equatable {
    case stableShell = "stable_shell"
    case visualizer = "visualizer"
    case recovery = "recovery"
    case privacy = "privacy"
    case manualOnly = "manual_only"
}

struct RecordingIslandVisualHarnessScenario: Equatable {
    let id: String
    let state: RecordingIslandStateName
    let area: RecordingIslandVisualHarnessArea
    let captureName: String
    let presentation: RecordingIslandPresentation
    let syntheticAudioLevel: Float
    let evidenceGuidance: String
    let manualValidationReason: String?

    var isRunnableInDevHarness: Bool {
        presentation.isVisible
    }

    var buttonTitle: String {
        id
    }

    var safeEvidenceSummary: String {
        [
            "scenario_id=\(id)",
            "capture_name=\(captureName)",
            "state=\(state.rawValue)",
            "area=\(area.rawValue)",
            "visualizer=\(presentation.showsVisualizer)",
            "primary_action=\(presentation.primaryAction?.rawValue ?? "none")",
            "secondary_action=\(presentation.secondaryAction?.rawValue ?? "none")",
            "manual_only=\(manualValidationReason != nil)"
        ].joined(separator: " ")
    }
}

enum RecordingIslandVisualTestHarness {
    static let forbiddenEvidenceFragments = [
        "PRIVATE_TRANSCRIPT",
        "cleanedText",
        "clipboard",
        "secret-token",
        "sk-",
        "@example",
        "/Users/"
    ]

    static var screenshotMatrix: [RecordingIslandVisualHarnessScenario] {
        [
            scenario(
                id: "ISLAND-000",
                state: .hiddenIdle,
                area: .manualOnly,
                evidenceGuidance: "Written confirmation only: island is dismissed and no app content is captured.",
                manualValidationReason: "Hidden state has no RubyWhisper UI to screenshot."
            ),
            scenario(
                id: "ISLAND-010",
                state: .recordingHold,
                area: .visualizer,
                presentation: RecordingIslandStateMachine.recording(
                    mode: .hold,
                    durationSnapshot: normalDurationSnapshot(mode: .hold)
                ),
                syntheticAudioLevel: 0.72,
                evidenceGuidance: "Crop to RubyWhisper island only; use synthetic meter level, no microphone input."
            ),
            scenario(
                id: "ISLAND-011",
                state: .recordingToggle,
                area: .visualizer,
                presentation: RecordingIslandStateMachine.recording(
                    mode: .toggle,
                    durationSnapshot: normalDurationSnapshot(mode: .toggle)
                ),
                syntheticAudioLevel: 0.54,
                evidenceGuidance: "Crop to RubyWhisper island only; use synthetic meter level, no microphone input."
            ),
            scenario(
                id: "ISLAND-012",
                state: .nearingDurationLimit,
                area: .stableShell,
                presentation: RecordingIslandStateMachine.recording(
                    mode: .toggle,
                    durationSnapshot: durationSnapshot(state: .nearingLimit, mode: .toggle)
                ),
                syntheticAudioLevel: 0.86,
                evidenceGuidance: "Crop to island only and record warning state with synthetic duration metadata."
            ),
            scenario(
                id: "ISLAND-013",
                state: .durationLimitReached,
                area: .recovery,
                evidenceGuidance: "Capture only island recovery copy and action; do not include audio file names."
            ),
            scenario(
                id: "ISLAND-020",
                state: .accountRefreshing,
                area: .stableShell,
                evidenceGuidance: "Capture only loading account island; no account email or auth material."
            ),
            scenario(
                id: "ISLAND-021",
                state: .processingUploading,
                area: .stableShell,
                presentation: RecordingIslandStateMachine.processingUpload(),
                evidenceGuidance: "Capture processing state only; no transcript, audio, provider payload, or request body."
            ),
            scenario(
                id: "ISLAND-022",
                state: .inserting,
                area: .stableShell,
                presentation: RecordingIslandStateMachine.inserting(),
                evidenceGuidance: "Capture inserting state over a neutral blank target only."
            ),
            scenario(
                id: "ISLAND-023",
                state: .success,
                area: .stableShell,
                presentation: RecordingIslandStateMachine.success(),
                evidenceGuidance: "Capture acknowledgement only; do not show dictated or cleaned text."
            ),
            scenario(
                id: "ISLAND-030",
                state: .onboardingBlocked,
                area: .recovery,
                evidenceGuidance: "Capture categorical setup recovery only; no permission prompt details."
            ),
            scenario(
                id: "ISLAND-031",
                state: .signedOut,
                area: .recovery,
                evidenceGuidance: "Capture sign-in recovery only; no browser, token, link, or account content."
            ),
            scenario(
                id: "ISLAND-032",
                state: .termsRequired,
                area: .recovery,
                evidenceGuidance: "Capture Terms recovery only; do not include web account content."
            ),
            scenario(
                id: "ISLAND-033",
                state: .trialExhausted,
                area: .recovery,
                evidenceGuidance: "Capture upgrade recovery only; no billing portal or card details."
            ),
            scenario(
                id: "ISLAND-034",
                state: .paymentFailed,
                area: .recovery,
                evidenceGuidance: "Capture billing recovery only; no billing portal, invoice, or card details."
            ),
            scenario(
                id: "ISLAND-035",
                state: .accountBlocked,
                area: .recovery,
                evidenceGuidance: "Capture account unavailable recovery only; no account identifiers."
            ),
            scenario(
                id: "ISLAND-036",
                state: .microphoneRecovery,
                area: .recovery,
                evidenceGuidance: "Capture microphone recovery only; no live permission prompt or device names."
            ),
            scenario(
                id: "ISLAND-037",
                state: .accessibilityRecovery,
                area: .recovery,
                evidenceGuidance: "Capture Accessibility recovery only; no System Settings window content."
            ),
            scenario(
                id: "ISLAND-038",
                state: .hotkeyUnavailable,
                area: .recovery,
                evidenceGuidance: "Capture categorical hotkey unavailable state only; do not identify other apps."
            ),
            scenario(
                id: "ISLAND-039",
                state: .hotkeyConflict,
                area: .recovery,
                evidenceGuidance: "Capture categorical hotkey conflict state only; do not identify other apps."
            ),
            scenario(
                id: "ISLAND-040",
                state: .recorderBusy,
                area: .recovery,
                evidenceGuidance: "Capture busy state only; no duplicate recording or audio evidence."
            ),
            scenario(
                id: "ISLAND-041U",
                state: .insertionUnavailable,
                area: .recovery,
                presentation: RecordingIslandStateMachine.insertionUnavailable(),
                evidenceGuidance: "Capture unavailable insertion recovery only; do not render target content or cleaned text."
            ),
            scenario(
                id: "ISLAND-041C",
                state: .fallbackCopied,
                area: .recovery,
                presentation: RecordingIslandStateMachine.fallbackCopied(),
                evidenceGuidance: "Capture copied fallback state only; do not show clipboard contents or cleaned text."
            ),
            scenario(
                id: "ISLAND-041",
                state: .insertionFailed,
                area: .recovery,
                presentation: RecordingIslandStateMachine.insertionFailed(),
                evidenceGuidance: "Capture Copy/Retry actions only; do not render cleaned text or clipboard content."
            ),
            scenario(
                id: "ISLAND-042",
                state: .rateLimited,
                area: .recovery,
                evidenceGuidance: "Capture rate-limit recovery only; no request payload or account details."
            ),
            scenario(
                id: "ISLAND-043",
                state: .networkError,
                area: .recovery,
                evidenceGuidance: "Capture network recovery only; no URLs with private query strings."
            ),
            scenario(
                id: "ISLAND-044",
                state: .providerError,
                area: .recovery,
                evidenceGuidance: "Capture provider recovery only; no provider payload, transcript, or audio."
            ),
            scenario(
                id: "ISLAND-045",
                state: .invalidAudio,
                area: .recovery,
                evidenceGuidance: "Capture record-again recovery only; no audio file names or waveform traces."
            ),
            scenario(
                id: "ISLAND-046",
                state: .serviceError,
                area: .recovery,
                evidenceGuidance: "Capture generic service recovery only; support-safe request IDs are allowed if synthetic."
            ),
            scenario(
                id: "ISLAND-047",
                state: .unsafeRetryRequired,
                area: .privacy,
                presentation: RecordingIslandStateMachine.unsafeRetryRequired(),
                evidenceGuidance: "Capture new-whisper recovery only; no same-audio retry or retained audio proof."
            )
        ]
    }

    static var runnableScenarioIDs: [String] {
        screenshotMatrix.filter(\.isRunnableInDevHarness).map(\.id)
    }

    static func scenario(id: String) -> RecordingIslandVisualHarnessScenario? {
        screenshotMatrix.first { $0.id == id }
    }

    private static func scenario(
        id: String,
        state: RecordingIslandStateName,
        area: RecordingIslandVisualHarnessArea,
        presentation: RecordingIslandPresentation? = nil,
        syntheticAudioLevel: Float = 0,
        evidenceGuidance: String,
        manualValidationReason: String? = nil
    ) -> RecordingIslandVisualHarnessScenario {
        RecordingIslandVisualHarnessScenario(
            id: id,
            state: state,
            area: area,
            captureName: "\(id.lowercased())-\(state.rawValue)",
            presentation: presentation ?? RecordingIslandStateMachine.syntheticPresentation(for: state),
            syntheticAudioLevel: syntheticAudioLevel,
            evidenceGuidance: evidenceGuidance,
            manualValidationReason: manualValidationReason
        )
    }

    private static func normalDurationSnapshot(mode: RecordingTriggerMode) -> RecordingDurationSnapshot {
        durationSnapshot(state: .normal, mode: mode)
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
}
