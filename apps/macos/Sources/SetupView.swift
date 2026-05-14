import SwiftUI
import AppKit
import AVFoundation
import Combine
import Foundation
import ServiceManagement

struct SetupView: View {
    var onComplete: () -> Void
    @EnvironmentObject var appState: AppState
    @Environment(\.openURL) private var openURL
    private let freeFlowAttributionSourceURL = URL(string: "https://github.com/zachlatta/freeflow")!
    private enum SetupStep: Int, CaseIterable {
        case welcomeAccount = 0
        case permissions
        case shortcuts
        case testTranscription
        case ready
    }

    @State private var currentStep = SetupStep.welcomeAccount
    @State private var micPermissionStatus: FirstRunOnboardingPermissionCategory = .unknown
    @State private var accessibilityStatus: FirstRunOnboardingPermissionCategory = .notDetermined
    @State private var accessibilityTimer: Timer?
    @State private var screenRecordingTimer: Timer?
    @State private var customVocabularyInput: String = ""

    // Test transcription state
    private enum TestPhase: Equatable {
        case idle, recording, transcribing, done
    }
    @State private var testPhase: TestPhase = .idle
    @State private var testAudioRecorder: AudioRecorder? = nil
    @State private var testAudioLevel: Float = 0.0
    @State private var testTranscript: String = ""
    @State private var testError: String? = nil
    @State private var testAudioLevelCancellable: AnyCancellable? = nil
    @State private var testMicPulsing = false
    @State private var holdShortcutValidationMessage: String?
    @State private var toggleShortcutValidationMessage: String?
    @State private var isCapturingHoldShortcut = false
    @State private var isCapturingToggleShortcut = false
    @StateObject private var testHotkeyHarness = SetupTestHotkeyHarness()

    private let totalSteps: [SetupStep] = SetupStep.allCases
    private var isCapturingShortcut: Bool {
        isCapturingHoldShortcut || isCapturingToggleShortcut
    }

    var body: some View {
        VStack(spacing: 0) {
            currentStepView
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 40)
                .padding(.vertical, 32)

            Divider()

            ZStack {
                stepIndicator

                HStack(alignment: .center) {
                    Group {
                        if currentStep != .welcomeAccount {
                            Button("Back") {
                                withAnimation {
                                    currentStep = previousStep(currentStep)
                                }
                            }
                        }
                    }

                    Spacer()

                    Group {
                        if currentStep != .ready {
                            if currentStep == .shortcuts {
                                Button("Continue") {
                                    saveCustomVocabularyAndContinue()
                                }
                                .keyboardShortcut(.defaultAction)
                            } else if currentStep == .testTranscription {
                                HStack(spacing: 10) {
                                    Button("Continue") {
                                        stopTestHotkeyMonitoring()
                                        withAnimation {
                                            currentStep = nextStep(currentStep)
                                        }
                                    }
                                    .keyboardShortcut(.defaultAction)
                                    .disabled(testPhase != .done || testTranscript.isEmpty || testError != nil)
                                }
                            } else {
                                Button("Continue") {
                                    withAnimation {
                                        currentStep = nextStep(currentStep)
                                    }
                                }
                                .keyboardShortcut(.defaultAction)
                                .disabled(!canContinueFromCurrentStep)
                            }
                        } else {
                            Button("Get Started") {
                                onComplete()
                            }
                            .keyboardShortcut(.defaultAction)
                            .disabled(!canFinishSetup)
                        }
                    }
                }
            }
            .padding(20)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .frame(width: 520, height: 680)
        .preferredColorScheme(appState.appearancePreference.preferredColorScheme)
        .onAppear {
            customVocabularyInput = appState.customVocabulary
            checkMicPermission()
            checkAccessibility()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            checkMicPermission()
            if currentStep == .permissions {
                appState.markAccessibilityRecoveryIfStillMissing()
                syncAccessibilityStatus()
            } else {
                checkAccessibility()
            }
        }
        .onDisappear {
            accessibilityTimer?.invalidate()
            screenRecordingTimer?.invalidate()
            appState.resumeHotkeyMonitoringAfterShortcutCapture()
        }
        .onChange(of: isCapturingShortcut) { isCapturing in
            if isCapturing {
                appState.suspendHotkeyMonitoringForShortcutCapture()
            } else {
                appState.resumeHotkeyMonitoringAfterShortcutCapture()
            }
        }
    }

    @ViewBuilder
    private var currentStepView: some View {
        switch currentStep {
        case .welcomeAccount:
            welcomeAccountStep
        case .permissions:
            permissionsStep
        case .shortcuts:
            shortcutsStep
        case .testTranscription:
            testTranscriptionStep
        case .ready:
            readyStep
        }
    }

    // MARK: - Steps

    var welcomeAccountStep: some View {
        let presentation = FirstRunOnboardingCoordinator.accountGatePresentation(
            for: appState.authCoordinatorState,
            recovery: appState.authAccountSnapshot.recovery
        )

        return ScrollView {
            VStack(spacing: 18) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 96, height: 96)

                VStack(spacing: 6) {
                    Text("Welcome to \(AppName.displayName)")
                        .font(.system(size: 28, weight: .bold, design: .rounded))

                    Text("Sign in, grant the two Mac permissions, choose shortcuts, then run one test whisper.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                setupCard(
                    "RubyWhisper Account",
                    systemImage: presentation.systemImageName,
                    tint: presentation.canContinue ? .green : .blue
                ) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(presentation.title)
                                .font(.headline)
                            Spacer()
                            if presentation.showsProgress {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(presentation.statusLabel)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }

                        Text(presentation.message)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        if let failureCode = appState.authAccountSnapshot.failureCode {
                            Text(accountRecoveryHint(for: failureCode))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        HStack(spacing: 10) {
                            if let title = presentation.primaryActionTitle {
                                Button(title) {
                                    _ = appState.performDesktopAccountRecoveryAction(presentation.primaryRecoveryAction)
                                }
                                .keyboardShortcut(.defaultAction)
                            }

                            if appState.authCoordinatorState.isLoginBridgePending {
                                Button("Cancel Sign In") {
                                    appState.cancelDesktopSignIn()
                                }
                            }

                            Button("Refresh Account") {
                                appState.refreshDesktopAccountState()
                            }
                            .disabled(appState.authCoordinatorState.isLoginBridgePending)
                        }
                        .controlSize(.regular)
                    }
                }

                setupCard("Attribution", systemImage: "doc.text.magnifyingglass", tint: .secondary) {
                    HStack(spacing: 8) {
                        Text("Derived from FreeFlow under the MIT license.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button {
                            openURL(freeFlowAttributionSourceURL)
                        } label: {
                            Label("Source", systemImage: "arrow.up.right")
                        }
                        .controlSize(.small)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            if appState.authCoordinatorState != .signedOut &&
                !appState.authCoordinatorState.isLoginBridgePending {
                appState.refreshDesktopAccountState()
            }
        }
    }

    var permissionsStep: some View {
        let micPresentation = MicrophonePermissionGate.presentation(for: micPermissionStatus)

        return ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    Text("Mac Permissions")
                        .font(.title.bold())
                    Text("RubyWhisper needs microphone input, Accessibility insertion, and app-context permission before the test whisper.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                setupCard("Microphone", systemImage: "mic.fill", tint: micPermissionColor) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(micPresentation.title)
                                .font(.headline)
                            Spacer()
                            Text(micPresentation.statusLabel)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(micPermissionColor)
                        }

                        Text(micPresentation.message)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        if micPresentation.showsRecoveryPath {
                            Text(MicrophonePermissionGate.recoveryPath)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        HStack(spacing: 10) {
                            if let actionTitle = micPresentation.primaryActionTitle {
                                Button(actionTitle) {
                                    handleMicrophonePrimaryAction(micPresentation.primaryAction)
                                }
                            }

                            if micPresentation.primaryAction == .openSystemSettings {
                                Button("Check Again") {
                                    checkMicPermission()
                                }
                            }
                        }
                    }
                }

                setupCard("Accessibility", systemImage: "hand.raised.fill", tint: accessibilityStatus == .granted ? .green : .blue) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Type finished dictation where your cursor already is. RubyWhisper only asks macOS whether it is trusted.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack {
                            Text("Status")
                                .font(.headline)
                            Spacer()
                            if accessibilityStatus == .granted {
                                Label("Granted", systemImage: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                            } else if accessibilityStatus == .requesting {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Waiting")
                                    .foregroundStyle(.secondary)
                            } else {
                                Text(accessibilityStatus.blocksInRecovery ? "Not Enabled" : "Not Requested")
                                    .foregroundStyle(accessibilityStatus.blocksInRecovery ? .orange : .secondary)
                            }
                        }

                        HStack(spacing: 10) {
                            Button(accessibilityStatus.blocksInRecovery ? "Open Settings" : "Request Access") {
                                requestAccessibility()
                            }
                            Button("Retry") {
                                checkAccessibility(recoveryWhenMissing: true)
                            }
                        }
                    }
                }

                setupCard("Screen Context", systemImage: "camera.viewfinder", tint: appState.hasScreenRecordingPermission ? .green : .blue) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(AppName.displayName) uses app context to adapt cleanup. Nothing is stored on RubyWhisper servers.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack {
                            Text("Status")
                                .font(.headline)
                            Spacer()
                            if appState.hasScreenRecordingPermission {
                                Label("Granted", systemImage: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                            } else {
                                Button("Grant Access") {
                                    appState.requestScreenCapturePermission()
                                }
                            }
                        }

                        if !appState.hasScreenRecordingPermission {
                            ScreenRecordingPermissionGuideView()
                        }
                    }
                }
            }
        }
        .onAppear {
            checkMicPermission()
            checkAccessibility()
            startAccessibilityPolling()
            startScreenRecordingPolling()
        }
        .onDisappear {
            accessibilityTimer?.invalidate()
            screenRecordingTimer?.invalidate()
        }
    }

    var shortcutsStep: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    Text("Shortcuts and Preferences")
                        .font(.title.bold())
                    Text("Choose how dictation starts, whether selected text can be transformed, and which local preferences should be enabled.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                setupCard("Dictation Shortcuts", systemImage: "keyboard.fill") {
                    VStack(alignment: .leading, spacing: 16) {
                        ShortcutRoleSection(
                            role: .hold,
                            selection: appState.holdShortcut,
                            validationMessage: holdShortcutValidationMessage,
                            isCapturing: $isCapturingHoldShortcut,
                            onSelect: { binding in
                                holdShortcutValidationMessage = appState.setShortcut(binding, for: .hold)
                            }
                        )

                        Divider()

                        ShortcutRoleSection(
                            role: .toggle,
                            selection: appState.toggleShortcut,
                            validationMessage: toggleShortcutValidationMessage,
                            isCapturing: $isCapturingToggleShortcut,
                            onSelect: { binding in
                                toggleShortcutValidationMessage = appState.setShortcut(binding, for: .toggle)
                            }
                        )
                    }
                }

                setupCard("Edit Mode", systemImage: "pencil") {
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle("Enable Edit Mode", isOn: Binding(
                            get: { appState.isCommandModeEnabled },
                            set: { newValue in
                                _ = appState.setCommandModeEnabled(newValue)
                            }
                        ))

                        Picker("Invocation Style", selection: Binding(
                            get: { appState.commandModeStyle },
                            set: { newValue in
                                _ = appState.setCommandModeStyle(newValue)
                            }
                        )) {
                            ForEach(CommandModeStyle.allCases) { style in
                                Text(style.title).tag(style)
                            }
                        }
                        .pickerStyle(.segmented)
                        .disabled(!appState.isCommandModeEnabled)

                        if appState.commandModeStyle == .manual {
                            Picker("Extra Modifier", selection: Binding(
                                get: { appState.commandModeManualModifier },
                                set: { newValue in
                                    _ = appState.setCommandModeManualModifier(newValue)
                                }
                            )) {
                                ForEach(CommandModeManualModifier.allCases) { modifier in
                                    Text(modifier.title).tag(modifier)
                                }
                            }
                            .disabled(!appState.isCommandModeEnabled)
                        }
                    }
                }

                setupCard("Local Preferences", systemImage: "slider.horizontal.3") {
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle("Launch \(AppName.displayName) at login", isOn: $appState.launchAtLogin)

                        Text("Vocabulary")
                            .font(.headline)

                        TextEditor(text: $customVocabularyInput)
                            .font(.system(.body, design: .monospaced))
                            .frame(minHeight: 84)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                            )

                        Text("Separate entries with commas, new lines, or semicolons.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .onAppear {
            customVocabularyInput = appState.customVocabulary
        }
    }

    var welcomeStep: some View {
        VStack(spacing: 16) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 128, height: 128)

            VStack(spacing: 6) {
                Text("Welcome to \(AppName.displayName)")
                    .font(.system(size: 30, weight: .bold, design: .rounded))

                Text("Dictate text anywhere on your Mac.\nHold to talk or tap to toggle dictation.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                    Button {
                        openURL(freeFlowAttributionSourceURL)
                    } label: {
                        Text("FreeFlow attribution")
                            .font(.system(.caption, design: .monospaced).weight(.medium))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.blue)

                    Spacer()

                    Button {
                        openURL(freeFlowAttributionSourceURL)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.right")
                            Text("Source")
                        }
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Color.yellow.opacity(0.18)))
                    }
                    .buttonStyle(.plain)
                }

                Text("RubyWhisper is derived from FreeFlow under the MIT license. This link is attribution only; onboarding uses RubyWhisper runtime identity.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    )
            )

        }
    }

    var accountGateStep: some View {
        let presentation = FirstRunOnboardingCoordinator.accountGatePresentation(
            for: appState.authCoordinatorState,
            recovery: appState.authAccountSnapshot.recovery
        )

        return VStack(spacing: 20) {
            Image(systemName: presentation.systemImageName)
                .font(.system(size: 60))
                .foregroundStyle(presentation.canContinue ? .green : .blue)

            Text(presentation.title)
                .font(.title)
                .fontWeight(.bold)

            Text(presentation.message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: appState.authStateSystemImage)
                        .frame(width: 24)
                        .foregroundStyle(presentation.canContinue ? .green : .blue)
                    Text("RubyWhisper Account")
                    Spacer()
                    if presentation.showsProgress {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(presentation.statusLabel)
                        .foregroundStyle(.secondary)
                        .font(.caption.monospaced())
                }

                if let failureCode = appState.authAccountSnapshot.failureCode {
                    Text(accountRecoveryHint(for: failureCode))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 10) {
                    if let title = presentation.primaryActionTitle {
                        Button(title) {
                            _ = appState.performDesktopAccountRecoveryAction(presentation.primaryRecoveryAction)
                        }
                        .keyboardShortcut(.defaultAction)
                    }

                    if appState.authCoordinatorState.isLoginBridgePending {
                        Button("Cancel Sign In") {
                            appState.cancelDesktopSignIn()
                        }
                    }

                    Button("Refresh Account") {
                        appState.refreshDesktopAccountState()
                    }
                    .disabled(appState.authCoordinatorState.isLoginBridgePending)
                }
                .controlSize(.regular)
            }
            .padding(12)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)
        }
        .onAppear {
            if appState.authCoordinatorState != .signedOut &&
                !appState.authCoordinatorState.isLoginBridgePending {
                appState.refreshDesktopAccountState()
            }
        }
    }

    var micPermissionStep: some View {
        let presentation = MicrophonePermissionGate.presentation(for: micPermissionStatus)

        return VStack(spacing: 20) {
            Image(systemName: "mic.fill")
                .font(.system(size: 60))
                .foregroundStyle(micPermissionColor)

            Text(presentation.title)
                .font(.title)
                .fontWeight(.bold)

            Text(presentation.message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: micPermissionStatusIcon)
                        .frame(width: 24)
                        .foregroundStyle(micPermissionColor)
                    Text("Microphone")
                    Spacer()
                    Text(presentation.statusLabel)
                        .foregroundStyle(micPermissionColor)
                        .font(.callout.weight(.semibold))
                }

                if presentation.showsRecoveryPath {
                    Text(MicrophonePermissionGate.recoveryPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 10) {
                    if let actionTitle = presentation.primaryActionTitle {
                        Button(actionTitle) {
                            handleMicrophonePrimaryAction(presentation.primaryAction)
                        }
                        .keyboardShortcut(.defaultAction)
                    }

                    if presentation.primaryAction == .openSystemSettings {
                        Button("Check Again") {
                            checkMicPermission()
                        }
                    }
                }
                .controlSize(.regular)
            }
            .padding(12)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)
        }
        .onAppear {
            checkMicPermission()
        }
    }

    var accessibilityStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "hand.raised.fill")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Accessibility Access")
                .font(.title)
                .fontWeight(.bold)

            Text("\(AppName.displayName) needs Accessibility access to type finished dictation where your cursor already is. The permission check only asks macOS whether RubyWhisper is trusted; it does not read surrounding app content.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 8) {
                instructionRow(number: "1", text: "Open System Settings when prompted.")
                instructionRow(number: "2", text: "Go to Privacy & Security > Accessibility.")
                instructionRow(number: "3", text: "Turn on RubyWhisper, then return here.")
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.blue.opacity(0.06))
            .cornerRadius(10)

            HStack {
                Image(systemName: "hand.raised.fill")
                    .frame(width: 24)
                    .foregroundStyle(.blue)
                Text("Accessibility")
                Spacer()
                if accessibilityStatus == .granted {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Granted")
                        .foregroundStyle(.green)
                } else if accessibilityStatus == .requesting {
                    ProgressView()
                        .controlSize(.small)
                    Text("Waiting")
                        .foregroundStyle(.secondary)
                    Button("Retry") {
                        checkAccessibility(recoveryWhenMissing: true)
                    }
                } else {
                    if accessibilityStatus.blocksInRecovery {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.orange)
                        Text("Not Enabled")
                            .foregroundStyle(.orange)
                    }
                    Button(accessibilityStatus.blocksInRecovery ? "Open Settings" : "Request Access") {
                        requestAccessibility()
                    }
                    if accessibilityStatus.blocksInRecovery {
                        Button("Retry") {
                            checkAccessibility(recoveryWhenMissing: true)
                        }
                    }
                }
            }
            .padding(12)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)

            if accessibilityStatus.blocksInRecovery {
                Label(
                    "If access was denied or left off, enable RubyWhisper in Accessibility and use Retry. Dictation stays blocked until macOS reports Accessibility as granted.",
                    systemImage: "arrow.clockwise.circle"
                )
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.orange.opacity(0.08))
                .cornerRadius(10)
            }

        }
        .onAppear {
            checkAccessibility()
            startAccessibilityPolling()
        }
        .onDisappear {
            accessibilityTimer?.invalidate()
        }
    }

    var screenRecordingStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "camera.viewfinder")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Screen Recording")
                .font(.title)
                .fontWeight(.bold)

            Text("\(AppName.displayName) intelligently adapts the transcription to the current app you're working in (ex. spelling names in an email correctly).")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text("It needs this permission to see which app you're working in and any in-progress work. Nothing is stored on \(AppName.displayName)'s servers (\(AppName.displayName) doesn't have servers).")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Image(systemName: "camera.viewfinder")
                    .frame(width: 24)
                    .foregroundStyle(.blue)
                Text("Screen Recording")
                Spacer()
                if appState.hasScreenRecordingPermission {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Granted")
                        .foregroundStyle(.green)
                } else {
                    Button("Grant Access") {
                        appState.requestScreenCapturePermission()
                    }
                }
            }
            .padding(12)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)

            if !appState.hasScreenRecordingPermission {
                ScreenRecordingPermissionGuideView()
            }

        }
        .onAppear {
            startScreenRecordingPolling()
        }
        .onDisappear {
            screenRecordingTimer?.invalidate()
        }
    }

    var holdShortcutStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "keyboard.fill")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Hold to Talk Shortcut")
                .font(.title)
                .fontWeight(.bold)

            Text("Choose the shortcut you want to hold while speaking.\nRelease it to stop unless you latch into tap mode later, or disable hold-to-talk entirely.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ShortcutRoleSection(
                role: .hold,
                selection: appState.holdShortcut,
                validationMessage: holdShortcutValidationMessage,
                isCapturing: $isCapturingHoldShortcut,
                onSelect: { binding in
                    holdShortcutValidationMessage = appState.setShortcut(binding, for: .hold)
                }
            )
                .padding(.top, 10)

            if appState.holdShortcut.usesFnKey {
                Text("Tip: If Fn opens Emoji picker, go to System Settings > Keyboard and change \"Press fn key to\" to \"Do Nothing\".")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }

        }
    }

    var toggleShortcutStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "switch.2")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Tap to Toggle Shortcut")
                .font(.title)
                .fontWeight(.bold)

            Text("Choose the shortcut you want to tap once to start dictating and tap again to stop.\nIf this shortcut becomes active while you are holding the hold shortcut, \(AppName.displayName) latches into tap mode. You can also disable tap-to-toggle entirely.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ShortcutRoleSection(
                role: .toggle,
                selection: appState.toggleShortcut,
                validationMessage: toggleShortcutValidationMessage,
                isCapturing: $isCapturingToggleShortcut,
                onSelect: { binding in
                    toggleShortcutValidationMessage = appState.setShortcut(binding, for: .toggle)
                }
            )
                .padding(.top, 10)

            if appState.toggleShortcut.usesFnKey {
                Text("Tip: If Fn opens Emoji picker, go to System Settings > Keyboard and change \"Press fn key to\" to \"Do Nothing\".")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }

        }
    }

    var vocabularyStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "text.book.closed.fill")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Custom Vocabulary")
                .font(.title)
                .fontWeight(.bold)

            Text("Add words and phrases that should be preserved in post-processing.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 8) {
                Text("Vocabulary")
                    .font(.headline)

                TextEditor(text: $customVocabularyInput)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 130)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                    )

                Text("Separate entries with commas, new lines, or semicolons.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

        }
    }

    var commandModeStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "pencil")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Edit Mode")
                .font(.title)
                .fontWeight(.bold)

            Text("Transform selected text with a spoken instruction instead of dictating over it.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 14) {
                Toggle("Enable Edit Mode", isOn: Binding(
                    get: { appState.isCommandModeEnabled },
                    set: { newValue in
                        _ = appState.setCommandModeEnabled(newValue)
                    }
                ))

                Picker("Invocation Style", selection: Binding(
                    get: { appState.commandModeStyle },
                    set: { newValue in
                        _ = appState.setCommandModeStyle(newValue)
                    }
                )) {
                    ForEach(CommandModeStyle.allCases) { style in
                        Text(style.title).tag(style)
                    }
                }
                .pickerStyle(.segmented)
                .disabled(!appState.isCommandModeEnabled)

                Group {
                    switch appState.commandModeStyle {
                    case .automatic:
                        Text("Automatic mode uses your normal dictation shortcut. If text is selected, \(AppName.displayName) transforms that selection instead of dictating new text.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    case .manual:
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Manual mode only triggers when you hold an extra modifier together with your normal dictation shortcut.")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)

                            Picker("Extra Modifier", selection: Binding(
                                get: { appState.commandModeManualModifier },
                                set: { newValue in
                                    _ = appState.setCommandModeManualModifier(newValue)
                                }
                            )) {
                                ForEach(CommandModeManualModifier.allCases) { modifier in
                                    Text(modifier.title).tag(modifier)
                                }
                            }
                            .disabled(!appState.isCommandModeEnabled || appState.commandModeStyle != .manual)
                        }
                    }
                }
                .opacity(appState.isCommandModeEnabled ? 1 : 0.5)

                if let validationMessage = appState.commandModeManualModifierValidationMessage {
                    Label(validationMessage, systemImage: "xmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(10)
        }
    }

    var launchAtLoginStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "sunrise.fill")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            Text("Launch at Login")
                .font(.title)
                .fontWeight(.bold)

            Text("Start \(AppName.displayName) automatically when you log in so it's always ready.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Image(systemName: "sunrise.fill")
                    .frame(width: 24)
                    .foregroundStyle(.blue)
                Toggle("Launch \(AppName.displayName) at login", isOn: $appState.launchAtLogin)
            }
            .padding(12)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)

        }
    }

    var testTranscriptionStep: some View {
        VStack(spacing: 20) {
            // Microphone picker
            VStack(spacing: 4) {
                Picker("Microphone:", selection: $appState.selectedMicrophoneID) {
                    Text("System Default").tag("default")
                    ForEach(appState.availableMicrophones) { device in
                        Text(device.name).tag(device.uid)
                    }
                }
                .frame(maxWidth: 340)

                Text("You can change this later in the menu bar or settings.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Group {
                switch testPhase {
                case .idle:
                    VStack(spacing: 20) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.blue)
                            .scaleEffect(testMicPulsing ? 1.15 : 1.0)
                            .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: testMicPulsing)

                        Text("Let's Try It Out!")
                            .font(.title)
                            .fontWeight(.bold)

                        if let hotkeyError = testHotkeyHarness.registrationErrorMessage {
                            hotkeyRecoveryBox(
                                title: "Global Shortcuts Unavailable",
                                message: hotkeyError,
                                guidance: "Enable RubyWhisper in Accessibility, then press Retry. If System Settings already shows RubyWhisper enabled, quit RubyWhisper and reset the development Accessibility row before reopening."
                            )
                        } else {
                            Text(testShortcutPrompt)
                                .font(.headline)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(Color.blue.opacity(0.1))
                                .cornerRadius(10)
                        }

                        Text("Say anything — a sentence or two is perfect.")
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        if appState.firstRunOnboardingStep == .accessibilityRecovery ||
                            appState.firstRunOnboardingStep == .accessibilityRequired ||
                            appState.firstRunOnboardingStep == .accessibilityRequesting {
                            Label(
                                "Accessibility must be granted before the test whisper can complete.",
                                systemImage: "hand.raised.fill"
                            )
                            .font(.callout)
                            .foregroundStyle(.orange)
                        }
                    }

                case .recording:
                    VStack(spacing: 20) {
                        ZStack {
                            Circle()
                                .fill(Color.blue.opacity(0.65))
                                .frame(width: 100, height: 100)

                            Circle()
                                .stroke(Color.blue.opacity(0.8), lineWidth: 3)
                                .frame(width: 100, height: 100)
                                .shadow(color: .blue.opacity(0.5), radius: 10)

                            WaveformView(audioLevel: testAudioLevel)
                        }

                        Text("Listening...")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundStyle(.blue)
                    }

                case .transcribing:
                    VStack(spacing: 20) {
                        InlineTranscribingDots()

                        Text("Transcribing...")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundStyle(.secondary)
                    }

                case .done:
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.green)

                        if let error = testError {
                            Text("Something went wrong")
                                .font(.title2)
                                .fontWeight(.semibold)

                            Text(error)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)

                            Text(retryShortcutPrompt)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        } else if testTranscript.isEmpty {
                            Text("No speech detected")
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundStyle(.secondary)

                            Text(retryShortcutPrompt)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Perfect — \(AppName.displayName) is ready to go.")
                                .font(.title2)
                                .fontWeight(.semibold)

                            Text(testTranscript)
                                .font(.body)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(nsColor: .controlBackgroundColor))
                                .cornerRadius(10)
                                .transition(.move(edge: .bottom).combined(with: .opacity))

                            Text(retryShortcutPrompt)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .transition(.opacity)
            .id(testPhase)

            Spacer()
        }
        .onAppear {
            checkMicPermission()
            checkAccessibility()
            appState.refreshAvailableMicrophones()
            testMicPulsing = true
            if micPermissionStatus == .granted && accessibilityStatus == .granted {
                startTestHotkeyMonitoring()
            } else {
                testError = firstRunTestLocalGateError()
                testPhase = .done
            }
        }
        .onDisappear {
            stopTestHotkeyMonitoring()
        }
    }

    var readyStep: some View {
        VStack(spacing: 20) {
            Image(systemName: appState.isHotkeyReadyForDictation ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundStyle(appState.isHotkeyReadyForDictation ? .green : .orange)

            Text(appState.isHotkeyReadyForDictation ? "You're All Set!" : "Hotkeys Need Attention")
                .font(.title)
                .fontWeight(.bold)

            Text(appState.isHotkeyReadyForDictation
                ? "\(AppName.displayName) lives in your menu bar."
                : "Fix global shortcuts before finishing setup.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            if canFinishSetup {
                VStack(alignment: .leading, spacing: 12) {
                    if appState.hasEnabledHoldShortcut {
                        HowToRow(icon: "keyboard", text: "Hold \(appState.holdShortcut.displayName) to record")
                    }
                    if appState.hasEnabledToggleShortcut {
                        HowToRow(icon: "switch.2", text: "Tap \(appState.toggleShortcut.displayName) to start and stop")
                    }
                    if appState.hasEnabledHoldShortcut && appState.hasEnabledToggleShortcut {
                        HowToRow(icon: "arrow.triangle.branch", text: "While holding, press the toggle shortcut to latch on")
                    }
                    if appState.isCommandModeEnabled {
                        switch appState.commandModeStyle {
                        case .automatic:
                            HowToRow(icon: "wand.and.stars", text: "With text selected, your normal shortcut transforms the selection")
                        case .manual:
                            HowToRow(
                                icon: "wand.and.stars",
                                text: "Hold \(appState.commandModeManualModifier.title) with your normal shortcut to transform selected text"
                            )
                        }
                    }
                    HowToRow(icon: "doc.on.clipboard", text: "Text is typed at your cursor & copied")
                }
                .padding(.top, 10)
            } else {
                hotkeyRecoveryBox(
                    title: appState.firstRunOnboardingStep == .ready ? appState.hotkeyRecoveryTitle : "Onboarding Not Complete",
                    message: appState.firstRunOnboardingStep == .ready
                        ? appState.hotkeyRecoveryMessage
                        : "Finish the required permission and test whisper steps before starting dictation.",
                    guidance: appState.firstRunOnboardingStep == .ready
                        ? "Use Accessibility first, then Retry. If macOS still blocks global shortcut capture, quit and reopen the freshly signed build before re-granting Accessibility."
                        : "Return to the highlighted onboarding step and complete the required permission or test whisper."
                )
            }

        }
    }

    var stepIndicator: some View {
        HStack(spacing: 8) {
            ForEach(totalSteps, id: \.rawValue) { step in
                Circle()
                    .fill(step == currentStep ? Color.blue : Color.gray.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
    }

    private var canContinueFromCurrentStep: Bool {
        switch currentStep {
        case .welcomeAccount:
            let presentation = FirstRunOnboardingCoordinator.accountGatePresentation(
                for: appState.authCoordinatorState,
                recovery: appState.authAccountSnapshot.recovery
            )
            return presentation.canContinue
        case .permissions:
            return MicrophonePermissionGate.presentation(for: micPermissionStatus).canProceed &&
                accessibilityStatus == .granted &&
                appState.hasScreenRecordingPermission
        case .testTranscription:
            return testPhase == .done && !testTranscript.isEmpty && testError == nil
        case .shortcuts, .ready:
            return true
        }
    }

    private var testShortcutPrompt: String {
        switch (appState.hasEnabledHoldShortcut, appState.hasEnabledToggleShortcut) {
        case (true, true):
            return "Hold \(appState.holdShortcut.displayName) or tap \(appState.toggleShortcut.displayName)"
        case (true, false):
            return "Hold \(appState.holdShortcut.displayName)"
        case (false, true):
            return "Tap \(appState.toggleShortcut.displayName)"
        case (false, false):
            return "Use Start Dictating from the menu bar"
        }
    }

    private var retryShortcutPrompt: String {
        "\(testShortcutPrompt) to try again"
    }

    private func accountRecoveryHint(for failureCode: RubyWhisperBackendErrorCode) -> String {
        switch failureCode {
        case .signedOut:
            return "Sign in again to connect this Mac."
        case .termsRequired:
            return "Accept the current beta terms in your account before continuing."
        case .subscriptionRequired, .trialExhausted:
            return "Open Account to finish plan setup before dictation."
        case .paymentFailed:
            return "Update billing from Account before continuing."
        case .accountBlocked:
            return "Contact support if this account state looks wrong."
        case .rateLimited:
            return "Wait for the retry window, then try again."
        case .durationLimitReached, .invalidAudio:
            return "Record a shorter test whisper and try again."
        case .providerError, .networkError, .serviceUnavailable, .internalError:
            return "Retry after a moment. If this repeats, contact support."
        case .unknown:
            return "Retry after a moment. If this repeats, contact support."
        }
    }

    private var canFinishSetup: Bool {
        appState.isHotkeyReadyForDictation &&
            appState.firstRunOnboardingStep == .ready
    }

    private func firstRunTestLocalGateError() -> String {
        if micPermissionStatus != .granted {
            let presentation = MicrophonePermissionGate.presentation(for: micPermissionStatus)
            if presentation.showsRecoveryPath {
                return "\(presentation.title). \(MicrophonePermissionGate.recoveryPath)."
            }
            return presentation.message
        }

        if accessibilityStatus != .granted {
            return "Accessibility access is required before the test whisper. Go back and enable RubyWhisper in System Settings > Privacy & Security > Accessibility."
        }

        return "Complete the local permission steps before trying a test whisper."
    }

    private func hotkeyRecoveryBox(title: String, message: String, guidance: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: "keyboard.badge.exclamationmark")
                .font(.headline)
                .foregroundStyle(.orange)
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(guidance)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Retry") {
                    appState.retryHotkeyRegistration()
                    if currentStep == .testTranscription {
                        startTestHotkeyMonitoring()
                    }
                }
                Button("Accessibility") {
                    appState.requestAccessibilityTrust()
                }
                Button("Hotkey Settings") {
                    appState.openHotkeySettings()
                }
            }
            .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.08))
        .cornerRadius(10)
    }

    // MARK: - Helpers

    private func instructionRow(number: String, text: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Text(number + ".")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 16, alignment: .trailing)
            Text(text)
                .font(.subheadline)
                .tint(.blue)
        }
    }

    private func setupCard<Content: View>(
        _ title: String,
        systemImage: String,
        tint: Color = .blue,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(tint)

            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
    }

    // MARK: - Actions

    func saveCustomVocabularyAndContinue() {
        appState.importPersonalDictionaryTerms(
            fromRawVocabulary: customVocabularyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        withAnimation {
            currentStep = nextStep(currentStep)
        }
    }

    private func previousStep(_ step: SetupStep) -> SetupStep {
        let previous = SetupStep(rawValue: step.rawValue - 1)
        return previous ?? .welcomeAccount
    }

    private func nextStep(_ step: SetupStep) -> SetupStep {
        let next = SetupStep(rawValue: step.rawValue + 1)
        return next ?? .ready
    }

    func checkMicPermission() {
        appState.refreshAvailableMicrophones()
        micPermissionStatus = MicrophonePermissionGate.category(
            from: AVCaptureDevice.authorizationStatus(for: .audio),
            hasInputDevice: !AudioDevice.availableInputDevices().isEmpty
        )
    }

    func requestMicPermission() {
        micPermissionStatus = .requesting
        appState.requestMicrophoneAccess { _ in
            checkMicPermission()
        }
    }

    private var micPermissionColor: Color {
        switch micPermissionStatus {
        case .granted:
            return .green
        case .denied, .restricted, .unavailable:
            return .orange
        case .requesting:
            return .blue
        case .unknown, .notDetermined:
            return .secondary
        }
    }

    private var micPermissionStatusIcon: String {
        switch micPermissionStatus {
        case .granted:
            return "checkmark.circle.fill"
        case .denied, .restricted, .unavailable:
            return "exclamationmark.triangle.fill"
        case .requesting:
            return "hourglass"
        case .unknown, .notDetermined:
            return "mic.fill"
        }
    }

    private func handleMicrophonePrimaryAction(_ action: MicrophonePermissionPrimaryAction) {
        switch action {
        case .none:
            break
        case .requestAccess:
            requestMicPermission()
        case .openSystemSettings:
            appState.openMicrophoneSettings()
            checkMicPermission()
        case .retry:
            checkMicPermission()
        }
    }

    func checkAccessibility(recoveryWhenMissing: Bool = false) {
        _ = appState.refreshAccessibilityTrustStatus(recoveryWhenMissing: recoveryWhenMissing)
        syncAccessibilityStatus()
    }

    func startAccessibilityPolling() {
        accessibilityTimer?.invalidate()
        accessibilityTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            DispatchQueue.main.async {
                checkAccessibility()
            }
        }
    }

    func requestAccessibility() {
        accessibilityStatus = .requesting
        appState.requestAccessibilityTrust()
    }

    private func syncAccessibilityStatus() {
        accessibilityStatus = appState.firstRunAccessibilityPermissionStatus
    }

    func startScreenRecordingPolling() {
        screenRecordingTimer?.invalidate()
        screenRecordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            DispatchQueue.main.async {
                appState.hasScreenRecordingPermission = CGPreflightScreenCaptureAccess()
            }
        }
    }

    // MARK: - Test Transcription

    private func startTestHotkeyMonitoring() {
        testHotkeyHarness.onAction = { action in
            switch action {
            case .start:
                guard testPhase == .idle || testPhase == .done else { return }
                guard canStartFirstRunTestWhisper() else {
                    testHotkeyHarness.resetSession()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        testPhase = .done
                    }
                    return
                }
                if testPhase == .done {
                    resetTest()
                }
                do {
                    let recorder = AudioRecorder()
                    recorder.onRecordingFailure = { [weak recorder] error in
                        guard let recorder else { return }
                        Task { @MainActor in
                            testAudioLevelCancellable?.cancel()
                            testAudioLevelCancellable = nil
                            testAudioLevel = 0.0
                            testHotkeyHarness.isTranscribing = false
                            testAudioRecorder = nil
                            testError = error.localizedDescription
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                testPhase = .done
                            }
                            recorder.cleanup()
                        }
                    }
                    try recorder.startRecording(deviceUID: appState.selectedMicrophoneID)
                    testAudioRecorder = recorder
                    testError = nil
                    testAudioLevelCancellable = recorder.$audioLevel
                        .receive(on: DispatchQueue.main)
                        .sink { level in
                            testAudioLevel = level
                        }
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        testPhase = .recording
                    }
                } catch {
                    testHotkeyHarness.resetSession()
                    testError = error.localizedDescription
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        testPhase = .done
                    }
                }

            case .stop, .stopAfterHoldTapGrace:
                guard testPhase == .recording, let recorder = testAudioRecorder else { return }
                testAudioLevelCancellable?.cancel()
                testAudioLevelCancellable = nil
                testAudioLevel = 0.0
                guard canStartFirstRunTestWhisper() else {
                    testHotkeyHarness.isTranscribing = false
                    testAudioRecorder = nil
                    testHotkeyHarness.resetSession()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        testPhase = .done
                    }
                    recorder.stopRecording { artifact in
                        artifact?.delete()
                    }
                    return
                }
                testHotkeyHarness.isTranscribing = true

                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    testPhase = .transcribing
                }
                recorder.stopRecording { artifact in
                    guard let artifact else {
                        Task { @MainActor in
                            testHotkeyHarness.isTranscribing = false
                            testAudioRecorder = nil
                            if testError == nil {
                                testError = "No audio file was created."
                            }
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                testPhase = .done
                            }
                        }
                        return
                    }

                    Task {
                        defer {
                            artifact.delete()
                        }
                        do {
                            let result = try await appState.transcribeTransientRecordingArtifact(artifact)
                            await MainActor.run {
                                testHotkeyHarness.isTranscribing = false
                                testAudioRecorder = nil
                                testTranscript = result.cleanedText
                                appState.markFirstRunTestWhisperCompleted()
                                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                                    testPhase = .done
                                }
                            }
                        } catch {
                            await MainActor.run {
                                testHotkeyHarness.isTranscribing = false
                                testAudioRecorder = nil
                                if let failure = error as? RubyWhisperDesktopTranscriptionFailure {
                                    testError = failure.message
                                } else {
                                    testError = error.localizedDescription
                                }
                                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                                    testPhase = .done
                                }
                            }
                        }
                    }
                }

            case .switchedToToggle:
                break
            }
        }

        do {
            try testHotkeyHarness.start(configuration: ShortcutConfiguration(
                hold: appState.holdShortcut,
                toggle: appState.toggleShortcut
            ), startDelay: appState.shortcutStartDelay)
        } catch {
            testError = error.localizedDescription
            testPhase = .done
        }
    }

    private func canStartFirstRunTestWhisper() -> Bool {
        checkMicPermission()
        checkAccessibility()

        guard appState.validateFirstRunTestDictationAccountGate() else {
            testError = appState.authStateTitle
            return false
        }

        guard micPermissionStatus == .granted else {
            testError = firstRunTestLocalGateError()
            if micPermissionStatus == .notDetermined {
                requestMicPermission()
            }
            return false
        }

        guard appState.refreshAccessibilityTrustStatus(recoveryWhenMissing: true) else {
            syncAccessibilityStatus()
            testError = firstRunTestLocalGateError()
            currentStep = .permissions
            return false
        }

        syncAccessibilityStatus()
        return FirstRunOnboardingCoordinator.canStartTestWhisper(from: FirstRunOnboardingGateSnapshot(
            authState: appState.authCoordinatorState,
            microphoneStatus: micPermissionStatus,
            accessibilityStatus: accessibilityStatus
        ))
    }

    private func stopTestHotkeyMonitoring() {
        testHotkeyHarness.stop()
        testAudioLevelCancellable?.cancel()
        testAudioLevelCancellable = nil
        if let recorder = testAudioRecorder, recorder.isRecording {
            recorder.cancelRecording()
        }
        testAudioRecorder = nil
    }

    private func resetTest() {
        testPhase = .idle
        testTranscript = ""
        testError = nil
        testAudioLevel = 0.0
        testMicPulsing = true
        testHotkeyHarness.isTranscribing = false
        testHotkeyHarness.resetSession()
        if let recorder = testAudioRecorder {
            if recorder.isRecording {
                recorder.cancelRecording()
            }
            testAudioRecorder = nil
        }
    }

}

private struct InlineTranscribingDots: View {
    @State private var activeDot = 0
    let timer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Color.blue.opacity(activeDot == index ? 1.0 : 0.3))
                    .frame(width: 12, height: 12)
                    .scaleEffect(activeDot == index ? 1.3 : 1.0)
                    .animation(.easeInOut(duration: 0.3), value: activeDot)
            }
        }
        .onReceive(timer) { _ in
            activeDot = (activeDot + 1) % 3
        }
    }
}

struct HowToRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 24)
                .foregroundStyle(.blue)
            Text(text)
                .foregroundStyle(.secondary)
        }
    }
}
