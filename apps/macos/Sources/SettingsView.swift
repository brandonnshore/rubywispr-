import SwiftUI
import AVFoundation
import ServiceManagement

// MARK: - Shared Helpers

private struct SettingsCard<Content: View>: View {
    let title: String
    let icon: String
    let content: Content

    init(_ title: String, icon: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.icon = icon
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.headline)
            content
        }
        .padding(Theme.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.72))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                .stroke(Theme.Color.islandStrokeInner, lineWidth: 1)
        )
    }
}

private struct HotkeyAvailabilityStatusView: View {
    @EnvironmentObject var appState: AppState

    private var iconName: String {
        appState.isHotkeyReadyForDictation ? "checkmark.circle.fill" : "keyboard.badge.exclamationmark"
    }

    private var iconColor: Color {
        appState.isHotkeyReadyForDictation ? .green : Theme.Color.accent
    }

    private var showsRecoveryActions: Bool {
        appState.hasRecoverableHotkeyFailure
    }

    private var statusLabel: String {
        appState.isHotkeyReadyForDictation ? "Ready" : "Needs permission"
    }

    private var statusTint: Color {
        appState.isHotkeyReadyForDictation ? .green : Theme.Color.accent
    }

    private var recoveryGuidance: String? {
        switch appState.hotkeyRegistrationState.reason {
        case .eventTapUnavailable:
            return "If more than one RubyWhisper entry appears in System Settings, enable the one for the app you just launched. Removing stale entries and reopening RubyWhisper can clear macOS permission confusion."
        case .eventTapRunLoopSourceUnavailable:
            return "macOS could not attach the keyboard monitor. Quit and reopen RubyWhisper if Retry does not recover."
        case .eventTapDisabledByTimeout, .eventTapDisabledByUserInput:
            return "Another keyboard utility or a system keyboard change may have interrupted monitoring. Retry after changing the conflicting setting."
        case .noBindingEnabled:
            return "Turn on Hold to Talk, Tap to Dictate, or both."
        case .holdBindingDisabled, .toggleBindingDisabled:
            return "One workflow is off; the remaining enabled shortcut can still start dictation."
        case .paused, .none, .unknown:
            return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                ZStack {
                    Circle()
                        .fill(iconColor.opacity(0.12))
                    Image(systemName: iconName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iconColor)
                }
                .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(appState.hotkeyRecoveryTitle)
                        .font(.headline)
                    Text(appState.shortcutStatusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 12)

                Text(statusLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusTint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(statusTint.opacity(0.12)))
            }

            Text(appState.hotkeyRecoveryMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let recoveryGuidance {
                Text(recoveryGuidance)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                            .fill(Theme.Color.accentSoft.opacity(0.55))
                    )
            }

            if showsRecoveryActions {
                HStack(spacing: 8) {
                    Button {
                        appState.retryHotkeyRegistration()
                    } label: {
                        Label("Retry", systemImage: "arrow.clockwise")
                    }

                    if appState.hotkeyRegistrationState.reason == .eventTapUnavailable {
                        Button {
                            appState.requestAccessibilityTrust()
                        } label: {
                            Label("Accessibility", systemImage: "hand.raised.fill")
                        }

                    }

                    Button {
                        appState.openKeyboardSettings()
                    } label: {
                        Label("Keyboard", systemImage: "keyboard")
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }
}

private let iso8601DayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

// MARK: - Settings

struct SettingsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(SettingsTab.visibleCases) { tab in
                    Button {
                        appState.selectedSettingsTab = tab
                    } label: {
                        SettingsSidebarRow(
                            title: tab.title,
                            icon: tab.icon,
                            isSelected: appState.selectedSettingsTab == tab
                        )
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
            }
            .padding(10)
            .frame(width: 180)
            .background(Color(nsColor: .windowBackgroundColor))

            Divider()

            Group {
                switch appState.selectedSettingsTab {
                case .account:
                    AccountSettingsView()
                case .appearance:
                    AppearanceSettingsView()
                case .general, .none:
                    GeneralSettingsView()
                case .advanced:
                    AdvancedSettingsView()
                case .prompts:
                    PromptsSettingsView()
                case .macros:
                    VoiceMacrosSettingsView()
                case .runLog:
                    RunLogView()
                case .debug:
                    DebugSettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .preferredColorScheme(appState.appearancePreference.preferredColorScheme)
    }
}

// MARK: - Account Settings

struct AccountSettingsView: View {
    @EnvironmentObject var appState: AppState

    private var presentation: AccountSettingsPresentation {
        AccountSettingsPresentation(
            snapshot: appState.authAccountSnapshot,
            coordinatorState: appState.authCoordinatorState,
            statusTitle: appState.authStateTitle,
            statusDetail: appState.authStateDetail
        )
    }

    private var showsSignOut: Bool {
        appState.authCoordinatorState.canTranscribe ||
            appState.authCoordinatorState == .signedInTermsRequired ||
            appState.authCoordinatorState == .trialExhausted ||
            appState.authCoordinatorState == .paymentFailed ||
            appState.authCoordinatorState == .blocked
    }

    var body: some View {
        let presentation = presentation

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Account")
                    .font(.largeTitle.bold())

                SettingsCard("Status", icon: appState.authStateSystemImage) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(presentation.statusTitle)
                                .font(.headline)
                            Spacer()
                            Text(presentation.stateCode)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                        }

                        Text(presentation.statusDetail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)

                        if presentation.isLoading {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Loading account")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        ForEach(presentation.statusRows) { row in
                            accountRow(row.title, value: row.value)
                        }

                        HStack(spacing: 8) {
                            if appState.authCoordinatorState.isLoginBridgePending {
                                Button {
                                    appState.cancelDesktopSignIn()
                                } label: {
                                    Label("Cancel Sign In", systemImage: "xmark.circle")
                                }
                            } else {
                                if let accountAction = presentation.accountAction {
                                    Button {
                                        _ = appState.performDesktopAccountRecoveryAction(accountAction.action)
                                    } label: {
                                        Label(accountAction.title, systemImage: accountAction.systemImage)
                                    }
                                    .disabled(appState.authCoordinatorState == .accountRefreshing)
                                }

                                if let recoveryButton = presentation.recoveryButton {
                                    Button {
                                        _ = appState.performDesktopAccountRecoveryAction(recoveryButton.action)
                                    } label: {
                                        Label(recoveryButton.title, systemImage: recoveryButton.systemImage)
                                    }
                                    .disabled(appState.authCoordinatorState == .accountRefreshing)
                                }

                                if !isRefreshRecoveryAction(presentation.recoveryButton?.action) {
                                    Button {
                                        appState.refreshDesktopAccountState()
                                    } label: {
                                        Label("Refresh Account", systemImage: "arrow.clockwise")
                                    }
                                    .disabled(appState.authCoordinatorState == .accountRefreshing)
                                }
                            }

                            if showsSignOut {
                                Button {
                                    _ = appState.logoutDesktopAccount()
                                } label: {
                                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                                }
                            }
                        }
                    }
                }

                SettingsCard("Plan", icon: "rectangle.badge.person.crop") {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(presentation.planRows) { row in
                            accountRow(row.title, value: row.value)
                        }
                    }
                }

                SettingsCard("Usage", icon: "chart.bar.xaxis") {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(presentation.usageRows) { row in
                            accountRow(row.title, value: row.value)
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func accountRow(_ title: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.caption.weight(.semibold))
            Spacer()
            Text(value)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
    }

    private func isRefreshRecoveryAction(_ action: RubyWhisperDesktopRecoveryAction?) -> Bool {
        switch action {
        case .retry, .retryAfter, .retryOrContactSupport:
            return true
        case .openSignIn, .openTermsAcceptance, .openCheckout, .openBilling,
             .openAccount, .startNewWhisper, .recordAgain, .unknown, nil:
            return false
        }
    }
}

// MARK: - Appearance Settings

struct AppearanceSettingsView: View {
    @EnvironmentObject var appState: AppState

    private var presentation: AppearanceSettingsPresentation {
        AppearanceSettingsPresentation(selectedPreference: appState.appearancePreference)
    }

    var body: some View {
        let presentation = presentation

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Appearance")
                    .font(.largeTitle.bold())

                SettingsCard("Appearance", icon: "circle.lefthalf.filled") {
                    VStack(alignment: .leading, spacing: 12) {
                        Picker("Appearance", selection: $appState.appearancePreference) {
                            ForEach(AppearanceSettingsPresentation.options) { option in
                                Text(option.title).tag(option)
                            }
                        }
                        .pickerStyle(.segmented)
                        .accessibilityHint("Changes the local appearance preference for RubyWhisper app surfaces.")

                        VStack(alignment: .leading, spacing: 4) {
                            Text(presentation.selectedTitle)
                                .font(.caption.weight(.semibold))
                            Text(presentation.selectedDetail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Divider()

                        Text(AppearanceSettingsPresentation.launchDirectionCopy)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(AppearanceSettingsPresentation.localOnlyCopy)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Advanced Settings

struct AdvancedSettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var copiedDiagnosticsInfo = false
    @State private var copiedDiagnosticsInfoResetWorkItem: DispatchWorkItem?

    private var presentation: AdvancedSettingsPresentation {
        AdvancedSettingsPresentation(
            diagnosticsMetadata: AdvancedSettingsPresentation.DiagnosticsMetadata(
                appDisplayName: appDisplayName,
                appVersion: appVersion,
                appBuildNumber: appBuildNumber,
                macOSVersion: macOSVersion,
                appArchitecture: appArchitecture
            )
        )
    }

    private var privacyPresentation: PrivacySettingsPresentation {
        PrivacySettingsPresentation(
            cleanupEnabled: appState.cleanupEnabled,
            contextAwareCleanupEnabled: appState.contextAwareCleanupEnabled,
            recentWisprsHistoryEnabled: appState.isRecentWisprsHistoryEnabled,
            recentWisprCount: appState.recentWisprs.count
        )
    }

    private var appDisplayName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String
            ?? "\(AppName.displayName)"
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
    }

    private var appBuildNumber: String {
        Bundle.main.object(forInfoDictionaryKey: "RubyWhisperBuildTag") as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
            ?? "unknown"
    }

    private var macOSVersion: String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
    }

    private var appArchitecture: String {
        #if arch(arm64)
        return "arm64"
        #elseif arch(x86_64)
        return "x86_64"
        #else
        return "unknown"
        #endif
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Advanced")
                    .font(.largeTitle.bold())

                SettingsCard("Privacy", icon: "hand.raised.fill") {
                    privacySection
                }

                SettingsCard("Diagnostics", icon: "info.circle.fill") {
                    diagnosticsSection
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var privacySection: some View {
        let presentation = privacyPresentation

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Toggle("Clean up transcripts", isOn: $appState.cleanupEnabled)
                    .accessibilityHint("Turns backend cleanup on or off without syncing local content.")

                Text(PrivacySettingsPresentation.cleanupCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let copy = presentation.cleanupStatusCopy {
                    Label(copy, systemImage: "pause.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Toggle("Use app context during cleanup", isOn: $appState.contextAwareCleanupEnabled)
                    .disabled(!presentation.isContextToggleEnabled)
                    .accessibilityHint("Controls whether app context is included in cleanup uploads.")

                Text(PrivacySettingsPresentation.contextCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let copy = presentation.contextStatusCopy {
                    Label(copy, systemImage: "eye.slash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Toggle("Use live OpenAI transcription", isOn: $appState.realtimeTranscriptionEnabled)
                    .accessibilityHint("Uses an experimental low-latency transcription path when available.")

                Text("Experimental. Falls back to standard upload if unavailable.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Toggle(isOn: Binding(
                    get: { appState.isRecentWisprsHistoryEnabled },
                    set: { appState.setRecentWisprsHistoryEnabled($0) }
                )) {
                    Text("Save Recent Wisprs on this Mac")
                }
                .accessibilityHint("Controls only local Recent Wisprs history on this Mac.")

                Text(PrivacySettingsPresentation.recentWisprsLocalOnlyCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let copy = presentation.recentWisprsStatusCopy {
                    Label(copy, systemImage: "clock.badge.xmark")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(PrivacySettingsPresentation.recentWisprsClearCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Button {
                        appState.clearRecentWisprs()
                    } label: {
                        Label("Clear Local Recent Wisprs", systemImage: "trash")
                    }
                    .disabled(!presentation.canClearRecentWisprs)

                    Button(role: .destructive) {
                        appState.disableAndClearRecentWisprsHistory()
                    } label: {
                        Label("Disable and Clear", systemImage: "trash.slash")
                    }
                    .disabled(!presentation.canDisableAndClearRecentWisprs)
                }
                .controlSize(.small)
            }
        }
    }

    private var diagnosticsSection: some View {
        let presentation = presentation

        return VStack(alignment: .leading, spacing: 10) {
            ForEach(presentation.diagnosticsRows, id: \.title) { row in
                HStack(alignment: .firstTextBaseline) {
                    Text(row.title)
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text(row.value)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }

            Text(AdvancedSettingsPresentation.diagnosticsPrivacyCopy)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .top, spacing: 12) {
                Text(presentation.diagnosticsCopyText)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)

                Spacer()

                Button {
                    copyDiagnostics()
                } label: {
                    Label(copiedDiagnosticsInfo ? "Copied" : "Copy", systemImage: copiedDiagnosticsInfo ? "checkmark" : "doc.on.doc")
                }
                .font(.caption)
            }
        }
    }

    private func copyDiagnostics() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(presentation.diagnosticsCopyText, forType: .string)
        copiedDiagnosticsInfo = true

        copiedDiagnosticsInfoResetWorkItem?.cancel()

        let resetWorkItem = DispatchWorkItem {
            copiedDiagnosticsInfo = false
            copiedDiagnosticsInfoResetWorkItem = nil
        }
        copiedDiagnosticsInfoResetWorkItem = resetWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: resetWorkItem)
    }
}

private struct SettingsSidebarRow: View {
    let title: String
    let icon: String
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                .frame(width: 16, height: 16, alignment: .center)
                .foregroundStyle(isSelected ? Theme.Color.accent : .primary)

            Text(title)
                .font(.body.weight(isSelected ? .semibold : .regular))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                .fill(isSelected ? Theme.Color.accentSoft : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                .stroke(isSelected ? Theme.Color.accent.opacity(0.22) : Color.clear, lineWidth: 1)
        )
    }
}

// MARK: - Debug Settings

struct DebugSettingsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Debug")
                    .font(.largeTitle.bold())

                SettingsCard("Overlay", icon: "wrench.and.screwdriver") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Show the recording overlay with simulated audio levels.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Button(appState.isDebugOverlayActive ? "Stop Debug Overlay" : "Debug Overlay") {
                            appState.toggleDebugOverlay()
                        }
                    }
                }

                SettingsCard("Update Overlay", icon: "arrow.down.circle") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Display the update available overlay after dictation finishes.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Toggle("Show after dictation", isOn: $appState.debugShowsUpdateReminderAfterDictation)

                        Button("Show Update Overlay Now") {
                            appState.showDebugUpdateAvailableOverlay()
                        }
                    }
                }

                SettingsCard("Island Visual Harness", icon: "rectangle.on.rectangle") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Show synthetic island states with placeholder-only copy and synthetic meter levels.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 148), spacing: 8)], spacing: 8) {
                            ForEach(RecordingIslandVisualTestHarness.screenshotMatrix, id: \.id) { scenario in
                                Button(scenario.buttonTitle) {
                                    _ = appState.showDebugIslandHarnessScenario(scenario.id)
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .disabled(!scenario.isRunnableInDevHarness)
                            }
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - General Settings

struct GeneralSettingsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.openURL) private var openURL
    @AppStorage("show_menu_bar_icon") private var showMenuBarIcon = true
    @State private var dictionaryFlow = PersonalDictionarySettingsFlow()
    @State private var micPermissionGranted = false
    @State private var showMutedHint = false
    @ObservedObject private var updateManager = UpdateManager.shared
    private let freeFlowAttributionSourceURL = URL(string: "https://github.com/zachlatta/freeflow")!

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // App branding header
                VStack(spacing: 12) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 64, height: 64)

                    Text(AppName.displayName)
                        .font(.system(size: 20, weight: .bold, design: .rounded))

                    Text("v\(appVersion)")
                        .font(.caption)
                        .foregroundStyle(.secondary)

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

                        Text("RubyWhisper is derived from FreeFlow under the MIT license. This link is attribution only; settings use RubyWhisper runtime identity.")
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
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
                .padding(.bottom, 4)

                SettingsCard("App", icon: "power") {
                    startupSection
                }
                SettingsCard("Updates", icon: "arrow.triangle.2.circlepath") {
                    updatesSection
                }
                SettingsCard("Output Language", icon: "globe") {
                    outputLanguageSection
                }
                SettingsCard("Live Transcription", icon: "bolt.fill") {
                    liveTranscriptionSection
                }
                SettingsCard("Dictation Shortcuts", icon: "keyboard.fill") {
                    hotkeySection
                }
                SettingsCard("Audio During Dictation", icon: "speaker.slash.fill") {
                    dictationAudioSection
                }
                SettingsCard("Edit Mode", icon: "pencil") {
                    commandModeSection
                }
                SettingsCard("Clipboard", icon: "doc.on.clipboard") {
                    clipboardSection
                }
                SettingsCard("Microphone", icon: "mic.fill") {
                    microphoneSection
                }
                SettingsCard("Sound Volume", icon: "speaker.wave.2.fill") {
                    soundVolumeSection
                }
                SettingsCard("Dictionary", icon: "text.book.closed.fill") {
                    vocabularySection
                }
                SettingsCard("Permissions", icon: "lock.shield.fill") {
                    permissionsSection
                }
            }
            .padding(24)
        }
        .onAppear {
            checkMicPermission()
            _ = appState.refreshAccessibilityTrustStatus()
            appState.hasScreenRecordingPermission = appState.hasScreenCapturePermission()
            appState.refreshLaunchAtLoginStatus()
        }
    }

    // MARK: Startup

    private var startupSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Launch \(AppName.displayName) at login", isOn: $appState.launchAtLogin)
            Toggle("Show menu bar icon", isOn: $showMenuBarIcon)
                .disabled(!AppBuild.canHideMenuBarIcon)

            if AppBuild.keepsDockIconVisibleWhenIdle {
                Text("This local build stays visible in the Dock, so you can reopen settings or quit even if the menu bar icon is hidden.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Required because \(AppName.displayName) runs without a Dock icon when idle.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if SMAppService.mainApp.status == .requiresApproval {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.caption)
                    Text("Login item requires approval in System Settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Open Login Items Settings") {
                        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension")!)
                    }
                    .font(.caption)
                }
            }
        }
    }

    // MARK: Updates

    private var updatesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Automatically check for updates", isOn: Binding(
                get: { updateManager.autoCheckEnabled },
                set: { updateManager.autoCheckEnabled = $0 }
            ))
            .disabled(!updateManager.isUpdateChannelEnabled)

            if !updateManager.isUpdateChannelEnabled {
                Label(updateManager.updateChannelDisabledMessage, systemImage: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                Button {
                    Task {
                        await updateManager.checkForUpdates(userInitiated: true)
                    }
                } label: {
                    if updateManager.isChecking {
                        HStack(spacing: 6) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Checking...")
                        }
                    } else {
                        Text("Check for Updates Now")
                    }
                }
                .disabled(!updateManager.isUpdateChannelEnabled || updateManager.isChecking || updateManager.updateStatus != .idle)

                if let lastCheck = updateManager.lastCheckDate {
                    Text("Last checked: \(lastCheck.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if updateManager.updateAvailable {
                VStack(alignment: .leading, spacing: 8) {
                    switch updateManager.updateStatus {
                    case .downloading:
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.circle.fill")
                                .foregroundStyle(.blue)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Downloading update...")
                                    .font(.caption.weight(.semibold))
                                ProgressView(value: updateManager.downloadProgress ?? 0)
                                    .progressViewStyle(.linear)
                                if let progress = updateManager.downloadProgress {
                                    Text("\(Int(progress * 100))%")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Button("Cancel") {
                                updateManager.cancelDownload()
                            }
                            .font(.caption)
                        }

                    case .installing:
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Installing update...")
                                .font(.caption.weight(.semibold))
                        }

                    case .readyToRelaunch:
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Relaunching...")
                                .font(.caption.weight(.semibold))
                        }

                    case .error(let message):
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text(message)
                                .font(.caption)
                                .foregroundStyle(.red)
                            Spacer()
                            Button("Retry") {
                                updateManager.updateStatus = .idle
                                if let release = updateManager.latestRelease {
                                    updateManager.downloadAndInstall(release: release)
                                }
                            }
                            .font(.caption)
                        }

                    case .idle:
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.circle.fill")
                                .foregroundStyle(.blue)
                            Text(updateManager.latestReleaseVersion.isEmpty
                                ? "A new version of \(AppName.displayName) is available!"
                                : "\(AppName.displayName) v\(updateManager.latestReleaseVersion) is available!")
                                .font(.caption.weight(.semibold))
                            Spacer()
                            Button("What's New") {
                                updateManager.showReleaseNotes()
                            }
                            .font(.caption)
                            Button("Update Now") {
                                if let release = updateManager.latestRelease {
                                    updateManager.downloadAndInstall(release: release)
                                }
                            }
                            .font(.caption)
                        }
                    }
                }
                .padding(10)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(6)
            }
        }
    }

    // MARK: Live Transcription

    private var liveTranscriptionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Use live OpenAI transcription", isOn: $appState.realtimeTranscriptionEnabled)

            Text("Streams audio during recording for lower latency. If it cannot connect or finish, RubyWhisper falls back to the standard upload path.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Output Language

    private static let outputLanguageOptions = [
        "",
        "English",
        "Chinese (Simplified)",
        "Chinese (Traditional)",
        "Spanish",
        "French",
        "Japanese",
        "Korean",
        "German",
        "Portuguese",
    ]

    private var outputLanguageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Language", selection: $appState.outputLanguage) {
                Text("Same as spoken").tag("")
                ForEach(Self.outputLanguageOptions.dropFirst(), id: \.self) { lang in
                    Text(lang).tag(lang)
                }
            }
            .pickerStyle(.menu)

            Text("When set, RubyWhisper translates your speech into the selected language.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: Dictation Shortcuts

    private var hotkeySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HotkeyAvailabilityStatusView()

            Divider()

            DictationShortcutEditor { isCapturing in
                if isCapturing {
                    appState.suspendHotkeyMonitoringForShortcutCapture()
                } else {
                    appState.resumeHotkeyMonitoringAfterShortcutCapture()
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Shortcut Start Delay")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text("\(appState.shortcutStartDelayMilliseconds) ms")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                Slider(
                    value: $appState.shortcutStartDelay,
                    in: 0...0.5,
                    step: 0.025
                )

                Text("Applies before recording starts for both hold and tap shortcuts. Stopping still happens immediately.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var dictationAudioSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(
                "Mute audio when dictation starts",
                isOn: $appState.dictationAudioInterruptionEnabled
            )

            Text("\(AppName.displayName) restores the audio state it changed when dictation ends.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var commandModeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle("Enable Edit Mode", isOn: Binding(
                get: { appState.isCommandModeEnabled },
                set: { newValue in
                    _ = appState.setCommandModeEnabled(newValue)
                }
            ))

            Text("Transform highlighted text with a spoken instruction instead of dictating over it.")
                .font(.caption)
                .foregroundStyle(.secondary)

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
                    Text("If text is selected, your normal dictation shortcut transforms the selection instead of dictating over it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                case .manual:
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Hold the extra modifier together with your normal dictation shortcut to transform selected text.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

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
    }

    // MARK: Clipboard

    private var clipboardSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Preserve clipboard after paste", isOn: $appState.preserveClipboard)

            Text("\(AppName.displayName) will temporarily place the transcript on your clipboard to paste it, then restore whatever was there before. If you copy something else before the restore happens, \(AppName.displayName) leaves it alone.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Divider()
                .padding(.vertical, 2)

            Toggle("Say \"press enter\" to submit after paste", isOn: $appState.isPressEnterVoiceCommandEnabled)

            Text("When the transcription ends with \"press enter\", \(AppName.displayName) removes those words before cleanup, pastes the remaining transcript, then presses Return.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: Microphone

    private var microphoneSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Select which microphone to use for recording.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(spacing: 6) {
                MicrophoneOptionRow(
                    name: "System Default",
                    isSelected: appState.selectedMicrophoneID == "default" || appState.selectedMicrophoneID.isEmpty,
                    action: { appState.selectedMicrophoneID = "default" }
                )
                ForEach(appState.availableMicrophones) { device in
                    MicrophoneOptionRow(
                        name: device.name,
                        isSelected: appState.selectedMicrophoneID == device.uid,
                        action: { appState.selectedMicrophoneID = device.uid }
                    )
                }
            }
        }
        .onAppear {
            appState.refreshAvailableMicrophones()
        }
    }

    // MARK: Sound Volume

    private var soundVolumeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Play alert sounds", isOn: $appState.alertSoundsEnabled)

            HStack(spacing: 12) {
                Image(systemName: "speaker.fill")
                    .foregroundStyle(.secondary)
                    .font(.caption)
                Slider(value: $appState.soundVolume, in: 0...1, step: 0.1)
                Image(systemName: "speaker.wave.3.fill")
                    .foregroundStyle(.secondary)
                    .font(.caption)
                Text("\(Int(appState.soundVolume * 100))%")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 36, alignment: .trailing)
            }
            .disabled(!appState.alertSoundsEnabled)
            .opacity(appState.alertSoundsEnabled ? 1 : 0.5)

            HStack(spacing: 8) {
                Button("Preview") {
                    let muted = SystemAudioStatus.isDefaultOutputMuted()
                    let volume = SystemAudioStatus.defaultOutputVolume()
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showMutedHint = muted || (volume ?? 1) < 0.10
                    }
                    appState.playAlertSound(named: "Bottle")
                }
                .font(.caption)
                .disabled(!appState.alertSoundsEnabled)

                if showMutedHint {
                    HStack(spacing: 4) {
                        Image(systemName: "speaker.slash.fill")
                            .foregroundStyle(.orange)
                        Text("System volume is muted or very low. Unmute to hear the preview.")
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                    .transition(.opacity)
                }
            }
        }
        .onChange(of: appState.alertSoundsEnabled) { enabled in
            if !enabled { showMutedHint = false }
        }
    }

    // MARK: Dictionary

    private var vocabularySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(PersonalDictionarySettingsFlow.localOnlyCopy)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Toggle(isOn: Binding(
                get: { appState.isPersonalDictionaryEnabled },
                set: { appState.setPersonalDictionaryEnabled($0) }
            )) {
                Text("Use dictionary during cleanup")
            }
            .accessibilityHint("Turns local dictionary use on or off without syncing or deleting saved terms.")

            if !appState.isPersonalDictionaryEnabled {
                Label(PersonalDictionarySettingsFlow.disabledCopy, systemImage: "pause.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if appState.personalDictionaryTerms.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "text.badge.plus")
                        .foregroundStyle(.secondary)
                    Text(PersonalDictionarySettingsFlow.emptyStateCopy)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.45))
                .cornerRadius(6)
            } else {
                VStack(spacing: 6) {
                    ForEach(appState.personalDictionaryTerms) { term in
                        dictionaryTermRow(term)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    TextField("Name or term", text: Binding(
                        get: { dictionaryFlow.draftTerm },
                        set: { dictionaryFlow.updateDraft($0) }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1)
                    .accessibilityLabel(dictionaryFlow.isEditing ? "Edited dictionary term" : "New dictionary term")
                    .onSubmit {
                        submitDictionaryTerm()
                    }

                    Button {
                        submitDictionaryTerm()
                    } label: {
                        Label(dictionaryFlow.submitLabel, systemImage: dictionaryFlow.isEditing ? "checkmark" : "plus")
                    }

                    if dictionaryFlow.isEditing {
                        Button {
                            dictionaryFlow.cancelEditing()
                        } label: {
                            Label(dictionaryFlow.cancelLabel, systemImage: "xmark")
                        }
                    }
                }

                if let validationMessage = dictionaryFlow.validationMessage {
                    Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Text("Up to \(PersonalDictionaryStore.maxActiveTerms) terms. Each term can be \(PersonalDictionaryStore.maxTermScalarLength) characters.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func dictionaryTermRow(_ term: PersonalDictionaryTerm) -> some View {
        HStack(spacing: 8) {
            Text(term.term)
                .font(.system(.body, design: .rounded))
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 28, alignment: .leading)
                .accessibilityLabel("Dictionary term")

            Button {
                dictionaryFlow.beginEditing(term)
            } label: {
                Image(systemName: "pencil")
            }
            .buttonStyle(.borderless)
            .help("Edit term")
            .accessibilityLabel("Edit dictionary term")

            Button(role: .destructive) {
                deleteDictionaryTerm(term)
            } label: {
                Image(systemName: "trash")
            }
            .buttonStyle(.borderless)
            .help("Delete term")
            .accessibilityLabel("Delete dictionary term")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.55))
        .cornerRadius(6)
    }

    private func submitDictionaryTerm() {
        do {
            if let editingTermID = dictionaryFlow.editingTermID {
                try appState.editPersonalDictionaryTerm(id: editingTermID, rawTerm: dictionaryFlow.draftTerm)
            } else {
                try appState.addPersonalDictionaryTerm(dictionaryFlow.draftTerm)
            }
            dictionaryFlow.finishSubmit()
        } catch {
            dictionaryFlow.setValidationError(error)
        }
    }

    private func deleteDictionaryTerm(_ term: PersonalDictionaryTerm) {
        do {
            try appState.deletePersonalDictionaryTerm(id: term.id)
            if dictionaryFlow.editingTermID == term.id {
                dictionaryFlow.cancelEditing()
            }
        } catch {
            dictionaryFlow.setValidationError(error)
        }
    }

    // MARK: Permissions

    private var permissionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            permissionRow(
                title: "Microphone",
                icon: "mic.fill",
                granted: micPermissionGranted,
                action: {
                    appState.requestMicrophoneAccess { granted in
                        micPermissionGranted = granted
                    }
                }
            )

            permissionRow(
                title: "Accessibility",
                icon: "hand.raised.fill",
                granted: appState.hasAccessibility,
                action: {
                    appState.requestAccessibilityTrust()
                }
            )

            permissionRow(
                title: "Screen Recording",
                icon: "camera.viewfinder",
                granted: appState.hasScreenRecordingPermission,
                action: {
                    appState.requestScreenCapturePermission()
                }
            )

            if !appState.hasScreenRecordingPermission {
                ScreenRecordingPermissionGuideView()
            }
        }
    }

    private func permissionRow(title: String, icon: String, granted: Bool, action: @escaping () -> Void) -> some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 20)
                .foregroundStyle(.blue)
            Text(title)
            Spacer()
            if granted {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Granted")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Button("Grant Access") {
                    action()
                }
                .font(.caption)
            }
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(6)
    }

    private func checkMicPermission() {
        micPermissionGranted = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    }

}

// MARK: - Microphone Option Row

struct MicrophoneOptionRow: View {
    let name: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? .blue : .secondary)
                Text(name)
                    .foregroundStyle(.primary)
                Spacer()
            }
            .padding(12)
            .background(isSelected ? Color.blue.opacity(0.1) : Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Prompts Settings

struct PromptsSettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var customSystemPromptInput: String = ""
    @State private var customContextPromptInput: String = ""
    @State private var showDefaultSystemPrompt = false
    @State private var showDefaultContextPrompt = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                SettingsCard("System Prompt", icon: "text.bubble.fill") {
                    systemPromptSection
                }
                SettingsCard("Context Prompt", icon: "eye.fill") {
                    contextPromptSection
                }
            }
            .padding(24)
        }
        .onAppear {
            customSystemPromptInput = appState.customSystemPrompt.isEmpty
                ? PostProcessingService.defaultSystemPrompt
                : appState.customSystemPrompt
            customContextPromptInput = appState.customContextPrompt.isEmpty
                ? AppContextService.defaultContextPrompt
                : appState.customContextPrompt
        }
    }

    // MARK: System Prompt

    private var systemPromptSection: some View {
        let isCustom = !appState.customSystemPrompt.isEmpty
        let hasNewerDefault = isCustom
            && !appState.customSystemPromptLastModified.isEmpty
            && appState.customSystemPromptLastModified < PostProcessingService.defaultSystemPromptDate

        return VStack(alignment: .leading, spacing: 10) {
            Text("Controls how raw transcriptions are cleaned up.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if hasNewerDefault {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundStyle(.blue)
                    Text("A newer default prompt is available.")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Button("View Default") {
                        showDefaultSystemPrompt.toggle()
                    }
                    .font(.caption)
                    Button("Switch to Default") {
                        customSystemPromptInput = PostProcessingService.defaultSystemPrompt
                        appState.customSystemPrompt = ""
                        appState.customSystemPromptLastModified = ""
                    }
                    .font(.caption)
                }
                .padding(10)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(6)
            }

            if showDefaultSystemPrompt {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Default System Prompt")
                            .font(.caption.weight(.semibold))
                        Spacer()
                        Button("Hide") {
                            showDefaultSystemPrompt = false
                        }
                        .font(.caption)
                    }
                    Text(PostProcessingService.defaultSystemPrompt)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                .padding(10)
                .background(Color(nsColor: .controlBackgroundColor))
                .cornerRadius(6)
            }

            TextEditor(text: $customSystemPromptInput)
                .font(.system(.body, design: .monospaced))
                .frame(minHeight: 120, maxHeight: 200)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                )
                .onChange(of: customSystemPromptInput) { newValue in
                    let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                    let defaultTrimmed = PostProcessingService.defaultSystemPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
                    if trimmed == defaultTrimmed || trimmed.isEmpty {
                        if !appState.customSystemPrompt.isEmpty {
                            appState.customSystemPrompt = ""
                            appState.customSystemPromptLastModified = ""
                        }
                    } else {
                        appState.customSystemPrompt = trimmed
                        let today = iso8601DayFormatter.string(from: Date())
                        if appState.customSystemPromptLastModified != today {
                            appState.customSystemPromptLastModified = today
                        }
                    }
                }

            HStack {
                if isCustom {
                    Label("Using custom prompt", systemImage: "pencil")
                        .font(.caption)
                        .foregroundStyle(.blue)
                } else {
                    Label("Using default", systemImage: "checkmark.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isCustom {
                    Button("Reset to Default") {
                        customSystemPromptInput = PostProcessingService.defaultSystemPrompt
                        appState.customSystemPrompt = ""
                        appState.customSystemPromptLastModified = ""
                    }
                    .font(.caption)
                }
            }

        }
    }

    // MARK: Context Prompt

    private var contextPromptSection: some View {
        let isCustom = !appState.customContextPrompt.isEmpty
        let hasNewerDefault = isCustom
            && !appState.customContextPromptLastModified.isEmpty
            && appState.customContextPromptLastModified < AppContextService.defaultContextPromptDate

        return VStack(alignment: .leading, spacing: 10) {
            Text("Controls how \(AppName.displayName) infers your current activity from app metadata and screenshots.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if hasNewerDefault {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundStyle(.blue)
                    Text("A newer default prompt is available.")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Button("View Default") {
                        showDefaultContextPrompt.toggle()
                    }
                    .font(.caption)
                    Button("Switch to Default") {
                        customContextPromptInput = AppContextService.defaultContextPrompt
                        appState.customContextPrompt = ""
                        appState.customContextPromptLastModified = ""
                    }
                    .font(.caption)
                }
                .padding(10)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(6)
            }

            if showDefaultContextPrompt {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Default Context Prompt")
                            .font(.caption.weight(.semibold))
                        Spacer()
                        Button("Hide") {
                            showDefaultContextPrompt = false
                        }
                        .font(.caption)
                    }
                    Text(AppContextService.defaultContextPrompt)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                .padding(10)
                .background(Color(nsColor: .controlBackgroundColor))
                .cornerRadius(6)
            }

            TextEditor(text: $customContextPromptInput)
                .font(.system(.body, design: .monospaced))
                .frame(minHeight: 120, maxHeight: 200)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                )
                .onChange(of: customContextPromptInput) { newValue in
                    let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                    let defaultTrimmed = AppContextService.defaultContextPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
                    if trimmed == defaultTrimmed || trimmed.isEmpty {
                        if !appState.customContextPrompt.isEmpty {
                            appState.customContextPrompt = ""
                            appState.customContextPromptLastModified = ""
                        }
                    } else {
                        appState.customContextPrompt = trimmed
                        let today = iso8601DayFormatter.string(from: Date())
                        if appState.customContextPromptLastModified != today {
                            appState.customContextPromptLastModified = today
                        }
                    }
                }

            HStack {
                if isCustom {
                    Label("Using custom prompt", systemImage: "pencil")
                        .font(.caption)
                        .foregroundStyle(.blue)
                } else {
                    Label("Using default", systemImage: "checkmark.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isCustom {
                    Button("Reset to Default") {
                        customContextPromptInput = AppContextService.defaultContextPrompt
                        appState.customContextPrompt = ""
                        appState.customContextPromptLastModified = ""
                    }
                    .font(.caption)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("Screenshot Resolution")
                    .font(.caption.weight(.semibold))

                Text("Controls the maximum image dimension sent for context inference.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Picker("", selection: $appState.contextScreenshotMaxDimension) {
                    ForEach(AppState.contextScreenshotDimensionOptions, id: \.self) { dimension in
                        Text("\(dimension) px").tag(dimension)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityLabel("Screenshot Resolution")

                HStack {
                    if appState.contextScreenshotMaxDimension == AppState.defaultContextScreenshotMaxDimension {
                        Label("Using default", systemImage: "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Label("Using custom value", systemImage: "pencil")
                            .font(.caption)
                            .foregroundStyle(.blue)
                    }
                    Spacer()
                    if appState.contextScreenshotMaxDimension != AppState.defaultContextScreenshotMaxDimension {
                        Button("Reset to Default") {
                            appState.contextScreenshotMaxDimension = AppState.defaultContextScreenshotMaxDimension
                        }
                        .font(.caption)
                    }
                }
            }

        }
    }

}

// MARK: - Run Log

struct RunLogView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Run Log")
                        .font(.headline)
                    Text("Stored locally. Only the \(appState.maxPipelineHistoryCount) most recent runs are kept.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                Spacer()
                Button("Clear History") {
                    appState.clearPipelineHistory()
                }
                .disabled(appState.pipelineHistory.isEmpty)
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 12)

            if !appState.lastDictationTimingSummary.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Latest timing")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(appState.lastDictationTimingSummary)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.bottom, 12)
            }

            Divider()

            if appState.pipelineHistory.isEmpty {
                VStack {
                    Spacer()
                    Text("No runs yet. Use dictation to populate history.")
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(appState.pipelineHistory) { item in
                            RunLogEntryView(item: item)
                        }
                    }
                    .padding(20)
                }
            }
        }
    }
}

// MARK: - Run Log Entry

struct RunLogEntryView: View {
    private let actionIconSize: CGFloat = 28
    let item: PipelineHistoryItem
    @EnvironmentObject var appState: AppState
    @State private var isExpanded = false
    @State private var isRetrying = false
    @State private var showContextPrompt = false
    @State private var showPostProcessingPrompt = false
    @State private var copiedTranscript = false
    @State private var copiedTranscriptResetWorkItem: DispatchWorkItem?
    @State private var copiedRawTranscript = false
    @State private var copiedRawTranscriptResetWorkItem: DispatchWorkItem?
    @State private var copiedCleanedTranscript = false
    @State private var copiedCleanedTranscriptResetWorkItem: DispatchWorkItem?

    private var isError: Bool {
        item.postProcessingStatus.hasPrefix("Error:")
    }

    private var copyableTranscript: String {
        if !item.postProcessedTranscript.isEmpty {
            return item.postProcessedTranscript
        }
        return item.rawTranscript
    }

    @ViewBuilder
    private func actionIconButton(
        systemName: String,
        color: Color = .secondary,
        help: String,
        disabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.caption)
                .foregroundStyle(color)
                .frame(width: actionIconSize, height: actionIconSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .help(help)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Collapsed header
            HStack(spacing: 0) {
                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isExpanded.toggle()
                    }
                }) {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: actionIconSize, height: actionIconSize)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isExpanded.toggle()
                    }
                } label: {
                    HStack {
                        if isError {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.timestamp.formatted(date: .numeric, time: .standard))
                                .font(.subheadline.weight(.semibold))
                            Text(item.postProcessedTranscript.isEmpty ? "(transcript not stored)" : item.postProcessedTranscript)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                HStack(spacing: 4) {
                    if isError && item.audioFileName != nil {
                        Button {
                            appState.retryTranscription(item: item)
                        } label: {
                            if isRetrying {
                                ProgressView()
                                    .controlSize(.mini)
                                    .frame(width: actionIconSize, height: actionIconSize)
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                                    .frame(width: actionIconSize, height: actionIconSize)
                                    .contentShape(Rectangle())
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(isRetrying)
                        .help("Retry transcription")
                    } else {
                        Color.clear
                            .frame(width: actionIconSize, height: actionIconSize)
                    }

                    actionIconButton(systemName: "square.and.arrow.up", help: "Export run log") {
                        TestCaseExporter.exportWithSavePanel(
                            item: item,
                            audioDirURL: AppState.audioStorageDirectory()
                        )
                    }

                    actionIconButton(
                        systemName: copiedTranscript ? "checkmark" : "doc.on.doc",
                        color: copiedTranscript ? .green : .secondary,
                        help: copiedTranscript ? "Copied transcript" : "Copy transcript",
                        disabled: copyableTranscript.isEmpty
                    ) {
                        copyTranscriptToPasteboard()
                    }

                    actionIconButton(systemName: "trash", help: "Delete this run") {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            appState.deleteHistoryEntry(id: item.id)
                        }
                    }
                }
            }
            .padding(12)

            if isExpanded {
                Divider()
                    .padding(.horizontal, 12)

                VStack(alignment: .leading, spacing: 16) {
                    // Audio player
                    if let audioFileName = item.audioFileName {
                        let audioURL = AppState.audioStorageDirectory().appendingPathComponent(audioFileName)
                        AudioPlayerView(audioURL: audioURL)
                    } else {
                        HStack(spacing: 6) {
                            Image(systemName: "waveform.slash")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Audio not stored")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Pipeline steps
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Pipeline")
                            .font(.caption.weight(.semibold))

                        if !item.timingSummary.isEmpty {
                            PipelineTimingSummaryView(summary: item.timingSummary)
                        }

                        // Step 1: Context Capture
                        PipelineStepView(
                            number: 1,
                            title: "Capture Context",
                            content: {
                                VStack(alignment: .leading, spacing: 6) {
                                    if let dataURL = item.contextScreenshotDataURL,
                                       let image = imageFromDataURL(dataURL) {
                                        Image(nsImage: image)
                                            .resizable()
                                            .aspectRatio(contentMode: .fit)
                                            .frame(maxHeight: 120)
                                            .cornerRadius(4)
                                    }

                                    if let prompt = item.contextPrompt, !prompt.isEmpty {
                                        Button {
                                            showContextPrompt.toggle()
                                        } label: {
                                            HStack(spacing: 4) {
                                                Text(showContextPrompt ? "Hide Prompt" : "Show Prompt")
                                                    .font(.caption)
                                                Image(systemName: showContextPrompt ? "chevron.up" : "chevron.down")
                                                    .font(.caption2)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                        .foregroundStyle(Color.accentColor)

                                        if showContextPrompt {
                                            Text(prompt)
                                                .font(.system(.caption2, design: .monospaced))
                                                .textSelection(.enabled)
                                                .padding(8)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                                .background(Color(nsColor: .controlBackgroundColor))
                                                .cornerRadius(4)
                                        }
                                    }

                                    if !item.contextSummary.isEmpty {
                                        Text(item.contextSummary)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .textSelection(.enabled)
                                    } else {
                                        Text("No context captured")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        )

                        // Step 2: Transcribe Audio
                        PipelineStepView(
                            number: 2,
                            title: "Transcribe Audio",
                            content: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Sent audio to the configured transcription model")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .textSelection(.enabled)
                                    if !item.rawTranscript.isEmpty {
                                        Text(item.rawTranscript)
                                            .font(.system(.caption, design: .monospaced))
                                            .textSelection(.enabled)
                                            .padding(8)
                                            .padding(.trailing, 24)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(Color(nsColor: .controlBackgroundColor))
                                            .cornerRadius(4)
                                            .overlay(alignment: .topTrailing) {
                                                Button {
                                                    copyRawTranscriptToPasteboard()
                                                } label: {
                                                    Image(systemName: copiedRawTranscript ? "checkmark" : "doc.on.doc")
                                                        .font(.caption)
                                                        .foregroundStyle(copiedRawTranscript ? .green : .secondary)
                                                        .padding(6)
                                                        .contentShape(Rectangle())
                                                }
                                                .buttonStyle(.plain)
                                                .help(copiedRawTranscript ? "Copied literal transcript" : "Copy literal transcript")
                                            }
                                    } else {
                                        Text("(transcript not stored)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        )

                        // Step 3: Post-Process
                        PipelineStepView(
                            number: 3,
                            title: "Post-Process",
                            content: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(item.postProcessingStatus)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .textSelection(.enabled)

                                    if let prompt = item.postProcessingPrompt, !prompt.isEmpty {
                                        Button {
                                            showPostProcessingPrompt.toggle()
                                        } label: {
                                            HStack(spacing: 4) {
                                                Text(showPostProcessingPrompt ? "Hide Prompt" : "Show Prompt")
                                                    .font(.caption)
                                                Image(systemName: showPostProcessingPrompt ? "chevron.up" : "chevron.down")
                                                    .font(.caption2)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                        .foregroundStyle(Color.accentColor)

                                        if showPostProcessingPrompt {
                                            Text(prompt)
                                                .font(.system(.caption2, design: .monospaced))
                                                .textSelection(.enabled)
                                                .padding(8)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                                .background(Color(nsColor: .controlBackgroundColor))
                                                .cornerRadius(4)
                                        }
                                    }

                                    if !item.postProcessedTranscript.isEmpty {
                                        Text(item.postProcessedTranscript)
                                            .font(.system(.caption, design: .monospaced))
                                            .textSelection(.enabled)
                                            .padding(8)
                                            .padding(.trailing, 24)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(Color(nsColor: .controlBackgroundColor))
                                            .cornerRadius(4)
                                            .overlay(alignment: .topTrailing) {
                                                Button {
                                                    copyCleanedTranscriptToPasteboard()
                                                } label: {
                                                    Image(systemName: copiedCleanedTranscript ? "checkmark" : "doc.on.doc")
                                                        .font(.caption)
                                                        .foregroundStyle(copiedCleanedTranscript ? .green : .secondary)
                                                        .padding(6)
                                                        .contentShape(Rectangle())
                                                }
                                                .buttonStyle(.plain)
                                                .help(copiedCleanedTranscript ? "Copied cleaned transcript" : "Copy cleaned transcript")
                                            }
                                    }
                                }
                            }
                        )
                    }

                }
                .padding(12)
            }
        }
        .background(Color(nsColor: .textBackgroundColor))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isError ? Color.red.opacity(0.4) : Color.secondary.opacity(0.2), lineWidth: 1)
        )
        .onReceive(appState.$retryingItemIDs) { ids in
            isRetrying = ids.contains(item.id)
        }
    }

    private func copyTranscriptToPasteboard() {
        guard !copyableTranscript.isEmpty else { return }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(copyableTranscript, forType: .string)
        copiedTranscript = true

        copiedTranscriptResetWorkItem?.cancel()
        let resetWorkItem = DispatchWorkItem {
            copiedTranscript = false
            copiedTranscriptResetWorkItem = nil
        }
        copiedTranscriptResetWorkItem = resetWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: resetWorkItem)
    }

    private func copyRawTranscriptToPasteboard() {
        guard !item.rawTranscript.isEmpty else { return }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(item.rawTranscript, forType: .string)
        copiedRawTranscript = true

        copiedRawTranscriptResetWorkItem?.cancel()
        let resetWorkItem = DispatchWorkItem {
            copiedRawTranscript = false
            copiedRawTranscriptResetWorkItem = nil
        }
        copiedRawTranscriptResetWorkItem = resetWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: resetWorkItem)
    }

    private func copyCleanedTranscriptToPasteboard() {
        guard !item.postProcessedTranscript.isEmpty else { return }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(item.postProcessedTranscript, forType: .string)
        copiedCleanedTranscript = true

        copiedCleanedTranscriptResetWorkItem?.cancel()
        let resetWorkItem = DispatchWorkItem {
            copiedCleanedTranscript = false
            copiedCleanedTranscriptResetWorkItem = nil
        }
        copiedCleanedTranscriptResetWorkItem = resetWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: resetWorkItem)
    }
}

struct PipelineTimingSummaryView: View {
    let summary: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "timer")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .frame(width: 20, height: 20)

            VStack(alignment: .leading, spacing: 6) {
                Text("Timing")
                    .font(.caption.weight(.semibold))
                Text(summary)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
        .cornerRadius(8)
    }
}

// MARK: - Pipeline Step View

struct PipelineStepView<Content: View>: View {
    let number: Int
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number)")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(Circle().fill(Color.accentColor))

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.caption.weight(.semibold))
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
        .cornerRadius(8)
    }
}

// MARK: - Audio Player

class AudioPlayerDelegate: NSObject, AVAudioPlayerDelegate {
    var onFinish: (() -> Void)?

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async {
            self.onFinish?()
        }
    }
}

struct AudioPlayerView: View {
    let audioURL: URL
    @State private var player: AVAudioPlayer?
    @State private var delegate = AudioPlayerDelegate()
    @State private var isPlaying = false
    @State private var duration: TimeInterval = 0
    @State private var elapsed: TimeInterval = 0
    @State private var progressTimer: Timer?

    private var progress: Double {
        guard duration > 0 else { return 0 }
        return min(elapsed / duration, 1.0)
    }

    var body: some View {
        HStack(spacing: 10) {
            Button {
                togglePlayback()
            } label: {
                Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                    .font(.body)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color.accentColor.opacity(0.15)))
            }
            .buttonStyle(.plain)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.15))
                        .frame(height: 4)
                    Capsule()
                        .fill(Color.accentColor)
                        .frame(width: max(0, geo.size.width * progress), height: 4)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 28)

            Text("\(formatDuration(elapsed)) / \(formatDuration(duration))")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .fixedSize()
        }
        .onAppear {
            loadDuration()
        }
        .onDisappear {
            stopPlayback()
        }
    }

    private func loadDuration() {
        guard FileManager.default.fileExists(atPath: audioURL.path) else { return }
        if let p = try? AVAudioPlayer(contentsOf: audioURL) {
            duration = p.duration
        }
    }

    private func togglePlayback() {
        if isPlaying {
            stopPlayback()
        } else {
            guard FileManager.default.fileExists(atPath: audioURL.path) else { return }
            do {
                let p = try AVAudioPlayer(contentsOf: audioURL)
                delegate.onFinish = {
                    self.stopPlayback()
                }
                p.delegate = delegate
                p.play()
                player = p
                isPlaying = true
                elapsed = 0
                startProgressTimer()
            } catch {}
        }
    }

    private func stopPlayback() {
        progressTimer?.invalidate()
        progressTimer = nil
        player?.stop()
        player = nil
        isPlaying = false
        elapsed = 0
    }

    private func startProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            if let p = player, p.isPlaying {
                elapsed = p.currentTime
            }
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layoutSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layoutSubviews(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            guard index < result.positions.count else { break }
            let pos = result.positions[index]
            subview.place(at: CGPoint(x: bounds.minX + pos.x, y: bounds.minY + pos.y), proposal: .unspecified)
        }
    }

    private func layoutSubviews(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalHeight = y + rowHeight
        }

        return (CGSize(width: maxWidth, height: totalHeight), positions)
    }
}

// MARK: - Voice Macros Settings

struct VoiceMacrosSettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingAddMacro = false
    @State private var editingMacro: VoiceMacro?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                SettingsCard("Voice Macros", icon: "music.mic") {
                    macrosSection
                }
            }
            .padding(24)
        }
        .sheet(isPresented: $showingAddMacro, onDismiss: { editingMacro = nil }) {
            VoiceMacroEditorView(isPresented: $showingAddMacro, macro: $editingMacro)
        }
    }

    private var macrosSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Bypass post-processing and immediately paste your predefined text.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button(action: { showingAddMacro = true }) {
                    Text("Add Macro")
                }
            }

            if appState.voiceMacros.isEmpty {
                VStack {
                    Image(systemName: "music.mic")
                        .font(.system(size: 30))
                        .foregroundStyle(.tertiary)
                        .padding(.bottom, 4)
                    Text("No Voice Macros Yet")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    Text("Click 'Add Macro' to define your first voice macro.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            } else {
                VStack(spacing: 1) {
                    ForEach(Array(appState.voiceMacros.enumerated()), id: \.element.id) { index, macro in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(macro.command)
                                    .font(.headline)
                                Spacer()
                                Button("Edit") {
                                    editingMacro = macro
                                    showingAddMacro = true
                                }
                                .buttonStyle(.borderless)
                                .font(.caption)

                                Button("Delete") {
                                    appState.voiceMacros.removeAll { $0.id == macro.id }
                                }
                                .buttonStyle(.borderless)
                                .font(.caption)
                                .foregroundStyle(.red)
                            }
                            Text(macro.payload)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        .padding(12)
                        .background(Color(nsColor: .controlBackgroundColor).opacity(0.8))
                    }
                }
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.primary.opacity(0.06), lineWidth: 1))
            }
        }
    }
}

struct VoiceMacroEditorView: View {
    @EnvironmentObject var appState: AppState
    @Binding var isPresented: Bool
    @Binding var macro: VoiceMacro?

    @State private var command: String = ""
    @State private var payload: String = ""

    var body: some View {
        VStack(spacing: 20) {
            Text(macro == nil ? "Add Macro" : "Edit Macro")
                .font(.headline)

            VStack(alignment: .leading, spacing: 8) {
                Text("Voice Command (What you say)")
                    .font(.caption.weight(.semibold))
                TextField("e.g. debugging prompt", text: $command)
                    .textFieldStyle(.roundedBorder)

                Text("Text (What gets pasted)")
                    .font(.caption.weight(.semibold))
                    .padding(.top, 8)
                TextEditor(text: $payload)
                    .font(.system(.body, design: .monospaced))
                    .frame(height: 150)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.3), lineWidth: 1))
            }

            HStack {
                Button("Cancel") {
                    isPresented = false
                    macro = nil
                }
                Spacer()
                Button("Save") {
                    let newMacro = VoiceMacro(
                        id: macro?.id ?? UUID(),
                        command: command.trimmingCharacters(in: .whitespacesAndNewlines),
                        payload: payload
                    )

                    if let existingIndex = appState.voiceMacros.firstIndex(where: { $0.id == newMacro.id }) {
                        appState.voiceMacros[existingIndex] = newMacro
                    } else {
                        appState.voiceMacros.append(newMacro)
                    }
                    isPresented = false
                    macro = nil
                }
                .disabled(command.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || payload.isEmpty)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(width: 400)
        .onAppear {
            if let m = macro {
                command = m.command
                payload = m.payload
            }
        }
    }
}
