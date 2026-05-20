import Carbon
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    let appState = AppState()
    var setupWindow: NSWindow?
    private var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        ensureReachableMenuBarIcon()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleShowSetup),
            name: .showSetup,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleShowSettings),
            name: .showSettings,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSetupCompletedFromExistingState),
            name: .setupCompletedFromExistingState,
            object: nil
        )
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )

        appState.startHotkeyMonitoring()
        _ = appState.completeSetupIfReadyFromExistingState(notify: false)

        if !appState.hasCompletedSetup {
            showSetupWindow()
        } else {
            restoreIdleActivationPolicy()
            startReadyRuntimeServices()
            if AppBuild.keepsDockIconVisibleWhenIdle {
                showSettingsWindow()
            }
        }

    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        guard appState.hasCompletedSetup else { return true }
        if !flag {
            showSettingsWindow()
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        appState.stopHotkeyMonitoring(reason: .appQuit)
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            handleIncomingURL(url)
        }
    }

    func applicationDidResignActive(_ notification: Notification) {
        appState.handleAppDeactivationForHotkeySafety()
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        guard AppBuild.keepsDockIconVisibleWhenIdle,
              appState.hasCompletedSetup,
              setupWindow == nil,
              settingsWindow?.isVisible != true else {
            return
        }
        showSettingsWindow()
    }

    @objc func handleShowSetup() {
        // Single wizard at a time — opening a second leaks the first's
        // willClose observer and breaks the bail-restore.
        if let existing = setupWindow, existing.isVisible {
            existing.makeKeyAndOrderFront(nil)
            activateAppForWindowPresentation()
            return
        }

        let wasCompleted = appState.hasCompletedSetup
        appState.hasCompletedSetup = false
        appState.stopAccessibilityPolling()
        appState.startHotkeyMonitoring()
        showSetupWindow()

        // Restore prior state if the user closes the wizard without completing.
        // completeSetup() flips hasCompletedSetup back to true before window.close(),
        // so the !hasCompletedSetup check below correctly skips the restore there.
        if wasCompleted, let window = setupWindow {
            NotificationCenter.default.addObserver(
                forName: NSWindow.willCloseNotification,
                object: window,
                queue: .main
            ) { [weak self] _ in
                guard let self = self else { return }
                if !self.appState.hasCompletedSetup {
                    self.appState.hasCompletedSetup = true
                    self.appState.startHotkeyMonitoring()
                    self.appState.startAccessibilityPolling()
                    self.restoreIdleActivationPolicy()
                }
                self.setupWindow = nil
            }
        }
    }

    @objc private func handleShowSettings() {
        showSettingsWindow()
    }

    @objc private func handleGetURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent replyEvent: NSAppleEventDescriptor) {
        guard let urlString = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
              let url = URL(string: urlString) else {
            return
        }
        handleIncomingURL(url)
    }

    private func handleIncomingURL(_ url: URL) {
        if handleLocalAppURL(url) {
            return
        }
        _ = appState.handleDesktopLoginCallback(url: url)
    }

    private func handleLocalAppURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "rubywhisper" else { return false }

        switch (url.host?.lowercased(), url.path.lowercased()) {
        case ("settings", _), (_, "/settings"):
            showSettingsWindow()
            return true
        case ("run-log", _), (_, "/run-log"):
            appState.selectedSettingsTab = .runLog
            showSettingsWindow()
            return true
        default:
            return false
        }
    }

    @objc private func handleSetupCompletedFromExistingState() {
        setupWindow?.close()
        setupWindow = nil
        restoreIdleActivationPolicy()
        startReadyRuntimeServices()
    }

    private func startReadyRuntimeServices() {
        appState.startAccessibilityPolling()
        Task { @MainActor in
            UpdateManager.shared.startPeriodicChecks()
        }

        if !AXIsProcessTrusted() {
            appState.markAccessibilityRecoveryIfStillMissing()
        }
    }

    private func showSettingsWindow() {
        NSApp.setActivationPolicy(.regular)

        if let settingsWindow, settingsWindow.isVisible {
            settingsWindow.makeKeyAndOrderFront(nil)
            activateAppForWindowPresentation()
            return
        }

        if settingsWindow == nil {
            presentSettingsWindow()
        } else {
            settingsWindow?.makeKeyAndOrderFront(nil)
            activateAppForWindowPresentation()
        }
    }

    private func presentSettingsWindow() {
        let settingsView = SettingsView()
            .environmentObject(appState)
        let hostingView = NSHostingView(rootView: settingsView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 780, height: 540),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = AppName.displayName
        window.contentView = hostingView
        window.sharingType = .readWrite
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        activateAppForWindowPresentation()

        settingsWindow = window

        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            if self?.setupWindow == nil {
                self?.restoreIdleActivationPolicy()
            }
            self?.settingsWindow = nil
        }
    }


    func showSetupWindow() {
        NSApp.setActivationPolicy(.regular)

        let setupView = SetupView(onComplete: { [weak self] in
            self?.completeSetup()
        })
        .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 680),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = AppName.displayName
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.contentView = NSHostingView(rootView: setupView)
        window.sharingType = .readWrite
        window.minSize = NSSize(width: 520, height: 680)
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        window.isReleasedWhenClosed = false

        self.setupWindow = window
        activateAppForWindowPresentation()
    }

    func completeSetup() {
        guard appState.canCompleteFirstRunSetup else {
            appState.statusText = "Complete onboarding"
            appState.debugStatusMessage = "Setup completion blocked: \(appState.firstRunOnboardingStep.rawValue)"
            setupWindow?.makeKeyAndOrderFront(nil)
            return
        }

        appState.hasCompletedSetup = true
        setupWindow?.close()
        setupWindow = nil
        restoreIdleActivationPolicy()
        appState.startHotkeyMonitoring()
        startReadyRuntimeServices()
    }

    private func ensureReachableMenuBarIcon() {
        guard !AppBuild.canHideMenuBarIcon else { return }
        UserDefaults.standard.set(true, forKey: "show_menu_bar_icon")
    }

    private func restoreIdleActivationPolicy() {
        NSApp.setActivationPolicy(AppBuild.keepsDockIconVisibleWhenIdle ? .regular : .accessory)
    }

    private func activateAppForWindowPresentation() {
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
