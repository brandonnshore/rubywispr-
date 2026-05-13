import SwiftUI
import AppKit

// MARK: - State

final class RecordingOverlayState: ObservableObject {
    @Published var phase: OverlayPhase = .recording
    @Published var islandPresentation: RecordingIslandPresentation = RecordingIslandStateMachine.hiddenIdle()
    @Published var audioLevel: Float = 0.0
    @Published var recordingTriggerMode: RecordingTriggerMode = .hold
    @Published var isCommandMode = false
    @Published var updateVersion: String = ""
}

enum OverlayPhase {
    case initializing
    case recording
    case transcribing
    case feedback
    case updateAvailable
}

// MARK: - Panel Helpers

private enum RecordingOverlayGeometry {
    /// Flow-style push-to-talk: waveform-only pill.
    static let holdWidth: CGFloat = 61
    /// Flow-style hands-free: cancel + waveform + finish.
    static let toggleWidth: CGFloat = 104
    /// Processing stays compact and wordless before dismissing.
    static let processingWidth: CGFloat = 61
    static let confirmWidth: CGFloat = 61
    /// Recovery layout still needs more room for affordance copy + actions.
    static let recoveryWidth: CGFloat = 248
    static let baseHeight: CGFloat = 27
    static let screenMargin: CGFloat = 8
    /// Distance above the Dock chrome (or screen edge when Dock auto-hides).
    static let dockOffset: CGFloat = 6
}

private func makeOverlayPanel(width: CGFloat, height: CGFloat) -> NSPanel {
    let panel = NSPanel(
        contentRect: NSRect(x: 0, y: 0, width: width, height: height),
        styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered,
        defer: false
    )
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = true
    panel.level = .screenSaver
    panel.ignoresMouseEvents = false
    panel.isMovableByWindowBackground = false
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.isReleasedWhenClosed = false
    panel.hidesOnDeactivate = false
    return panel
}

private func makePillContent<V: View>(
    width: CGFloat,
    height: CGFloat,
    rootView: V
) -> NSView {
    let cornerRadius = height / 2
    let pillShape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    let shaped = rootView
        .frame(width: width, height: height)
        .background(Theme.Color.islandActiveFill)
        .overlay(
            pillShape
                .strokeBorder(Theme.Color.islandStrokeInner, lineWidth: 0.5)
        )
        .clipShape(pillShape)
        .shadow(color: Theme.Color.islandShadow, radius: 1, x: 0, y: 1)

    let hosting = NSHostingView(rootView: shaped)
    hosting.frame = NSRect(x: 0, y: 0, width: width, height: height)
    hosting.autoresizingMask = [.width, .height]
    return hosting
}

// MARK: - Manager

final class RecordingOverlayManager {
    private var overlayWindow: NSPanel?
    private let overlayState = RecordingOverlayState()
    private var overlayBottomCenterAnchor: NSPoint?

    var onStopButtonPressed: (() -> Void)?
    var onUpdateOverlayPressed: (() -> Void)?
    var onRecoveryActionPressed: ((RecordingIslandAction) -> Void)?

    private var shouldReduceMotion: Bool {
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    /// Anchor display for the recording island — prefers the screen containing the
    /// currently-active key window so the pill follows the user across monitors.
    private var anchorScreen: NSScreen? {
        if let keyWindow = NSApp.keyWindow, let screen = keyWindow.screen {
            return screen
        }
        return NSScreen.main
    }

    func showInitializing(mode: RecordingTriggerMode = .hold, isCommandMode: Bool = false) {
        DispatchQueue.main.async {
            self.overlayState.recordingTriggerMode = mode
            self.overlayState.isCommandMode = isCommandMode
            self.overlayState.islandPresentation = RecordingIslandStateMachine.recording(
                mode: mode,
                durationSnapshot: RecordingDurationSnapshot.inactive(policy: .production)
            )
            self.overlayState.phase = .initializing
            self.overlayState.audioLevel = 0
            self.showOverlayPanel(animatedResize: false)
        }
    }

    func showRecording(mode: RecordingTriggerMode = .hold, isCommandMode: Bool = false) {
        DispatchQueue.main.async {
            self.overlayState.recordingTriggerMode = mode
            self.overlayState.isCommandMode = isCommandMode
            self.overlayState.islandPresentation = RecordingIslandStateMachine.recording(
                mode: mode,
                durationSnapshot: RecordingDurationSnapshot.inactive(policy: .production)
            )
            self.overlayState.phase = .recording
            self.overlayState.audioLevel = 0
            self.showOverlayPanel(animatedResize: true)
        }
    }

    func transitionToRecording(mode: RecordingTriggerMode = .hold, isCommandMode: Bool = false) {
        DispatchQueue.main.async {
            self.overlayState.recordingTriggerMode = mode
            self.overlayState.isCommandMode = isCommandMode
            self.overlayState.islandPresentation = RecordingIslandStateMachine.recording(
                mode: mode,
                durationSnapshot: RecordingDurationSnapshot.inactive(policy: .production)
            )
            self.overlayState.phase = .recording
            self.updateOverlayLayout(animated: true)
        }
    }

    func setRecordingTriggerMode(_ mode: RecordingTriggerMode, animated: Bool) {
        DispatchQueue.main.async {
            self.overlayState.recordingTriggerMode = mode
            if self.overlayState.islandPresentation.state.isRecordingState {
                self.overlayState.islandPresentation = RecordingIslandStateMachine.recording(
                    mode: mode,
                    durationSnapshot: RecordingDurationSnapshot.inactive(policy: .production)
                )
            }
            self.updateOverlayLayout(animated: animated)
        }
    }

    func updateRecordingDuration(_ snapshot: RecordingDurationSnapshot) {
        DispatchQueue.main.async {
            let mode = snapshot.mode ?? self.overlayState.recordingTriggerMode
            self.overlayState.recordingTriggerMode = mode
            self.showIslandPresentation(
                RecordingIslandStateMachine.recording(mode: mode, durationSnapshot: snapshot),
                animatedResize: true
            )
        }
    }

    func updateAudioLevel(_ level: Float) {
        DispatchQueue.main.async {
            self.overlayState.audioLevel = level
        }
    }

    func showTranscribing() {
        DispatchQueue.main.async {
            self.showIslandPresentation(RecordingIslandStateMachine.processingUpload(), animatedResize: true)
        }
    }

    func showFailureIndicator() {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.syntheticPresentation(for: .serviceError),
                animatedResize: true
            )
        }
    }

    func showBlockedHotkey(
        reason: HotkeyRecordingGateBlockReason,
        authState: DesktopAuthCoordinatorState,
        onboardingStep: FirstRunOnboardingStep
    ) {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.blockedHotkey(
                    reason: reason,
                    authState: authState,
                    onboardingStep: onboardingStep
                ),
                animatedResize: true
            )
        }
    }

    func showAccountGate(_ authState: DesktopAuthCoordinatorState) {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.account(authState),
                animatedResize: true
            )
        }
    }

    func showUploadFailure(_ failure: RubyWhisperDesktopTranscriptionFailure) {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.uploadFailure(failure),
                animatedResize: true
            )
        }
    }

    func showDurationLimitReached() {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.syntheticPresentation(for: .durationLimitReached),
                animatedResize: true
            )
        }
    }

    func showMicrophoneRecovery() {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.syntheticPresentation(for: .microphoneRecovery),
                animatedResize: true
            )
        }
    }

    func showInserting() {
        DispatchQueue.main.async {
            self.showIslandPresentation(RecordingIslandStateMachine.inserting(), animatedResize: true)
        }
    }

    func showSuccess() {
        DispatchQueue.main.async {
            self.dismissAll()
        }
    }

    func showInsertionUnavailable() {
        DispatchQueue.main.async {
            self.showIslandPresentation(RecordingIslandStateMachine.insertionUnavailable(), animatedResize: true)
        }
    }

    func showFallbackCopied(after result: DirectInsertionResult? = nil) {
        DispatchQueue.main.async {
            self.showIslandPresentation(RecordingIslandStateMachine.fallbackCopied(after: result), animatedResize: true)
        }
    }

    func showDirectInsertionRecovery(for result: DirectInsertionResult) {
        DispatchQueue.main.async {
            self.showIslandPresentation(
                RecordingIslandStateMachine.directInsertionRecovery(for: result),
                animatedResize: true
            )
        }
    }

    func showInsertionFailed() {
        DispatchQueue.main.async {
            self.showIslandPresentation(RecordingIslandStateMachine.insertionFailed(), animatedResize: true)
        }
    }

    func showSyntheticIslandState(_ state: RecordingIslandStateName) {
        DispatchQueue.main.async {
            self.overlayState.audioLevel = 0
            self.showIslandPresentation(
                RecordingIslandStateMachine.syntheticPresentation(for: state),
                animatedResize: true
            )
        }
    }

    func showSyntheticIslandHarnessScenario(_ scenario: RecordingIslandVisualHarnessScenario) {
        DispatchQueue.main.async {
            self.overlayState.audioLevel = scenario.syntheticAudioLevel
            switch scenario.presentation.state {
            case .recordingHold:
                self.overlayState.recordingTriggerMode = .hold
            case .recordingToggle, .nearingDurationLimit:
                self.overlayState.recordingTriggerMode = .toggle
            case .hiddenIdle, .onboardingBlocked, .accountRefreshing, .signedOut,
                 .termsRequired, .trialExhausted, .paymentFailed, .accountBlocked,
                 .microphoneRecovery, .accessibilityRecovery, .hotkeyUnavailable,
                 .hotkeyConflict, .recorderBusy, .durationLimitReached,
                 .processingUploading, .inserting, .success, .insertionUnavailable,
                 .fallbackCopied, .insertionFailed, .rateLimited, .networkError,
                 .providerError, .invalidAudio, .serviceError, .unsafeRetryRequired:
                break
            }
            self.showIslandPresentation(
                scenario.presentation,
                animatedResize: true
            )
        }
    }

    func showUpdateAvailable(version: String) {
        DispatchQueue.main.async {
            self.overlayState.isCommandMode = false
            self.overlayState.updateVersion = version
            self.overlayState.phase = .updateAvailable
            self.showOverlayPanel(animatedResize: true)
        }
    }

    func dismiss() {
        DispatchQueue.main.async {
            self.dismissAll()
        }
    }

    private func showOverlayPanel(animatedResize: Bool) {
        overlayBottomCenterAnchor = nil
        let frame = overlayFrame

        if let panel = overlayWindow {
            panel.ignoresMouseEvents = false
            panel.contentView = makeOverlayContent(frame: frame)
            resize(panel: panel, to: frame, animated: animatedResize)
            panel.alphaValue = 1
            panel.orderFrontRegardless()
            return
        }

        let panel = makeOverlayPanel(width: frame.width, height: frame.height)
        panel.hasShadow = false
        panel.ignoresMouseEvents = false
        panel.contentView = makeOverlayContent(frame: frame)

        guard let screen = anchorScreen else { return }

        // Slide up from just below the screen edge so the pill appears to rise from the Dock.
        let hiddenFrame = NSRect(
            x: frame.origin.x,
            y: screen.frame.minY - frame.height,
            width: frame.width,
            height: frame.height
        )
        panel.setFrame(hiddenFrame, display: true)
        panel.alphaValue = 1
        panel.orderFrontRegardless()

        guard !shouldReduceMotion else {
            panel.setFrame(frame, display: true)
            overlayWindow = panel
            return
        }

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.34, 1.56, 0.64, 1.0)
            panel.animator().setFrame(frame, display: true)
        }

        overlayWindow = panel
    }

    private func updateOverlayLayout(animated: Bool) {
        guard let panel = overlayWindow else { return }
        overlayBottomCenterAnchor = nil
        let frame = overlayFrame
        panel.ignoresMouseEvents = false
        panel.contentView = makeOverlayContent(frame: frame)
        resize(panel: panel, to: frame, animated: animated)
    }

    private func makeOverlayContent(frame: NSRect) -> NSView {
        makePillContent(
            width: frame.width,
            height: frame.height,
            rootView: RecordingOverlayView(
                state: overlayState,
                onStopButtonPressed: { [weak self] in
                    self?.onStopButtonPressed?()
                },
                onUpdateOverlayPressed: { [weak self] in
                    self?.onUpdateOverlayPressed?()
                },
                onRecoveryActionPressed: { [weak self] action in
                    self?.onRecoveryActionPressed?(action)
                }
            )
        )
    }

    private func resize(panel: NSPanel, to frame: NSRect, animated: Bool) {
        guard animated, !shouldReduceMotion else {
            panel.setFrame(frame, display: true)
            return
        }

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.22
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            panel.animator().setFrame(frame, display: true)
        }
    }

    private var overlayFrame: NSRect {
        guard let screen = anchorScreen else { return .zero }
        let width = overlayWidth
        let height = RecordingOverlayGeometry.baseHeight
        let anchor = overlayBottomCenterAnchor ?? defaultBottomCenterAnchor(on: screen)
        let proposedX = anchor.x - width / 2
        // Anchor at the bottom of the panel: panel.minY = anchor.y so the pill sits above the Dock.
        let proposedY = anchor.y
        let x = clamp(
            proposedX,
            minimum: screen.visibleFrame.minX + RecordingOverlayGeometry.screenMargin,
            maximum: screen.visibleFrame.maxX - width - RecordingOverlayGeometry.screenMargin
        )
        let y = clamp(
            proposedY,
            minimum: screen.visibleFrame.minY + RecordingOverlayGeometry.dockOffset,
            maximum: screen.visibleFrame.maxY - height - RecordingOverlayGeometry.screenMargin
        )
        return NSRect(x: x, y: y, width: width, height: height)
    }

    private var overlayWidth: CGFloat {
        if overlayState.phase == .updateAvailable || overlayState.islandPresentation.usesRecoveryLayout {
            return RecordingOverlayGeometry.recoveryWidth
        }

        switch overlayState.islandPresentation.visualState {
        case .listening:
            return overlayState.recordingTriggerMode == .toggle ||
                overlayState.islandPresentation.state == .nearingDurationLimit
                ? RecordingOverlayGeometry.toggleWidth
                : RecordingOverlayGeometry.holdWidth
        case .processing:
            return RecordingOverlayGeometry.processingWidth
        case .confirm:
            return RecordingOverlayGeometry.confirmWidth
        case .idle, .error:
            return RecordingOverlayGeometry.processingWidth
        }
    }

    private func showIslandPresentation(
        _ presentation: RecordingIslandPresentation,
        animatedResize: Bool
    ) {
        overlayState.islandPresentation = presentation
        if !presentation.isVisible {
            dismissAll()
            return
        }
        if presentation.state == .success {
            dismissAll()
            return
        }

        switch presentation.state {
        case .recordingHold, .recordingToggle, .nearingDurationLimit:
            overlayState.phase = .recording
        case .accountRefreshing, .processingUploading, .inserting:
            overlayState.phase = .transcribing
        case .success, .onboardingBlocked, .signedOut, .termsRequired,
             .trialExhausted, .paymentFailed, .accountBlocked,
             .microphoneRecovery, .accessibilityRecovery, .hotkeyUnavailable,
             .hotkeyConflict, .recorderBusy, .durationLimitReached,
             .insertionUnavailable, .fallbackCopied, .insertionFailed,
             .rateLimited, .networkError, .providerError, .invalidAudio,
             .serviceError, .unsafeRetryRequired:
            overlayState.phase = .feedback
        case .hiddenIdle:
            dismissAll()
            return
        }

        showOverlayPanel(animatedResize: animatedResize)
    }

    private func dismissAll() {
        overlayBottomCenterAnchor = nil
        overlayState.isCommandMode = false
        overlayState.updateVersion = ""
        overlayState.islandPresentation = RecordingIslandStateMachine.hiddenIdle()
        if let panel = overlayWindow {
            panel.orderOut(nil)
            overlayWindow = nil
        }
    }

    private func preserveCurrentAnchor() {
        guard let panel = overlayWindow else { return }
        // Track the panel's bottom edge so the pill stays anchored above the Dock
        // when it resizes between compact and recovery widths.
        overlayBottomCenterAnchor = NSPoint(x: panel.frame.midX, y: panel.frame.minY)
    }

    private func defaultBottomCenterAnchor(on screen: NSScreen) -> NSPoint {
        NSPoint(
            x: screen.visibleFrame.midX,
            y: screen.visibleFrame.minY + RecordingOverlayGeometry.dockOffset
        )
    }

    private func clamp(_ value: CGFloat, minimum: CGFloat, maximum: CGFloat) -> CGFloat {
        guard minimum <= maximum else { return minimum }
        return min(max(value, minimum), maximum)
    }
}

// MARK: - Waveform Views

struct WaveformBar: View {
    let amplitude: CGFloat

    private let minHeight: CGFloat = 2
    private let maxHeight: CGFloat = 12

    var body: some View {
        Capsule()
            .fill(.white)
            .frame(width: 2, height: minHeight + (maxHeight - minHeight) * amplitude)
    }
}

struct WaveformView: View {
    let audioLevel: Float
    var showsActivityPulse = false
    var reduceMotion = false

    private static let barCount = 9
    private static let multipliers: [CGFloat] = [0.35, 0.55, 0.75, 0.9, 1.0, 0.9, 0.75, 0.55, 0.35]
    private static let centerIndex = CGFloat((barCount - 1) / 2)

    var body: some View {
        Group {
            if reduceMotion {
                reducedMotionBars()
            } else if showsActivityPulse {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                    waveformBars(pulseTime: context.date.timeIntervalSinceReferenceDate)
                }
            } else {
                waveformBars(pulseTime: nil)
            }
        }
        .frame(height: 13)
    }

    private func reducedMotionBars() -> some View {
        let level = CGFloat(max(min(audioLevel, 1), 0))
        let tickLevel = (level * 4).rounded(.down) / 4

        return HStack(spacing: 2) {
            ForEach(0..<Self.barCount, id: \.self) { index in
                WaveformBar(amplitude: min(tickLevel * Self.multipliers[index], 1.0))
            }
        }
    }

    private func waveformBars(pulseTime: TimeInterval?) -> some View {
        HStack(spacing: 1.65) {
            ForEach(0..<Self.barCount, id: \.self) { index in
                WaveformBar(amplitude: barAmplitude(for: index, pulseTime: pulseTime))
                    .animation(
                        .spring(
                            response: barResponse(for: index),
                            dampingFraction: 0.88
                        )
                        .delay(barDelay(for: index)),
                        value: audioLevel
                    )
            }
        }
    }

    private func barAmplitude(for index: Int, pulseTime: TimeInterval?) -> CGFloat {
        let level = CGFloat(max(audioLevel, 0))
        let baseAmplitude = min(level * Self.multipliers[index], 1.0)

        guard let pulseTime else { return baseAmplitude }

        let travelingWave = CGFloat(0.5 + 0.5 * sin((pulseTime * 6.2) - Double(index) * 0.78))
        let shimmer = CGFloat(0.5 + 0.5 * sin((pulseTime * 3.1) + Double(index) * 0.5))
        let pulse = travelingWave * 0.22 + shimmer * 0.06

        let saturationRelief = baseAmplitude * (0.74 + pulse)
        let quietPulse = (1.0 - baseAmplitude) * (0.04 + pulse * 0.28)
        return min(saturationRelief + quietPulse, 1.0)
    }

    private func barResponse(for index: Int) -> Double {
        let distance = abs(CGFloat(index) - Self.centerIndex)
        let normalizedDistance = distance / Self.centerIndex
        return 0.18 + Double(normalizedDistance) * 0.06
    }

    private func barDelay(for index: Int) -> Double {
        let distance = abs(CGFloat(index) - Self.centerIndex)
        return Double(distance) * 0.01
    }
}

struct ProcessingIndicatorView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rotation: Double = 0

    var body: some View {
        ZStack {
            if reduceMotion {
                Circle()
                    .fill(.white.opacity(0.78))
                    .frame(width: 6, height: 6)
            } else {
                Circle()
                    .trim(from: 0.18, to: 0.86)
                    .stroke(Color.white.opacity(0.92), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .frame(width: 13, height: 13)
                    .rotationEffect(.degrees(rotation))
                    .onAppear {
                        rotation = 0
                        withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) {
                            rotation = 360
                        }
                    }
            }
        }
        .frame(width: 16, height: 16)
    }
}

struct InitializingDotsView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var activeDot = 0
    @State private var timer: Timer?

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(.white.opacity(activeDot == index ? 0.9 : 0.25))
                    .frame(width: 4.5, height: 4.5)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: activeDot)
            }
        }
        .onAppear {
            guard !reduceMotion else {
                activeDot = 1
                return
            }
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
                DispatchQueue.main.async {
                    activeDot = (activeDot + 1) % 3
                }
            }
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }
}

struct HoldRecordingView: View {
    let audioLevel: Float
    var showsActivityPulse = false
    var reduceMotion = false

    var body: some View {
        WaveformView(
            audioLevel: audioLevel,
            showsActivityPulse: showsActivityPulse,
            reduceMotion: reduceMotion
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Recording while held")
    }
}

struct RecordingOverlayView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject var state: RecordingOverlayState
    let onStopButtonPressed: () -> Void
    let onUpdateOverlayPressed: () -> Void
    let onRecoveryActionPressed: (RecordingIslandAction) -> Void

    private let accessoryWidth: CGFloat = 23

    private var visualState: RecordingIslandVisualState {
        state.islandPresentation.visualState
    }

    private var showsLiveRecordingContent: Bool {
        visualState == .listening && state.islandPresentation.showsVisualizer
    }

    private var showsHandsFreeControls: Bool {
        visualState == .listening &&
            (state.recordingTriggerMode == .toggle ||
             state.islandPresentation.state == .nearingDurationLimit)
    }

    private var showsRecoveryFeedback: Bool {
        state.phase == .feedback && visualState == .error
    }

    private var showsCancelControl: Bool {
        showsHandsFreeControls
    }

    private var showsRightControl: Bool {
        showsHandsFreeControls || visualState == .confirm
    }

    var body: some View {
        Group {
            if showsRecoveryFeedback {
                IslandFeedbackView(
                    presentation: state.islandPresentation,
                    onRecoveryActionPressed: onRecoveryActionPressed
                )
            } else if state.phase == .updateAvailable {
                UpdateAvailableOverlayView(onPress: onUpdateOverlayPressed)
            } else {
                ZStack {
                    Group {
                        if state.phase == .initializing ||
                            (showsLiveRecordingContent && !showsHandsFreeControls) {
                            HoldRecordingView(
                                audioLevel: state.audioLevel,
                                showsActivityPulse: state.phase == .recording,
                                reduceMotion: reduceMotion
                            )
                            .transition(.opacity.combined(with: .scale(scale: 0.98)))
                        } else if showsLiveRecordingContent {
                            WaveformView(
                                audioLevel: state.audioLevel,
                                showsActivityPulse: state.phase == .recording,
                                reduceMotion: reduceMotion
                            )
                                .transition(.opacity)
                        } else {
                            IslandProgressView(presentation: state.islandPresentation)
                                .transition(.opacity.combined(with: .scale(scale: 0.96)))
                        }
                    }

                    HStack {
                        Group {
                            if showsCancelControl {
                                IslandControlButton(
                                    accessibilityLabel: "Cancel whisper",
                                    fill: Theme.Color.cancelButtonFill,
                                    action: { onRecoveryActionPressed(.cancelIfSafe) }
                                ) {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 10.5, weight: .bold))
                                        .foregroundStyle(Theme.Color.cancelButtonGlyph)
                                }
                                .transition(controlTransition)
                            } else if state.isCommandMode {
                                CommandModeIndicator()
                                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
                            }
                        }
                        .frame(width: accessoryWidth, alignment: .center)
                        .frame(maxHeight: .infinity, alignment: .center)

                        Spacer(minLength: 0)

                        Group {
                            if showsRightControl {
                                islandRightControl
                                    .transition(controlTransition)
                            }
                        }
                        .frame(width: accessoryWidth, alignment: .center)
                        .frame(maxHeight: .infinity, alignment: .center)
                    }
                }
            }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.phase)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.recordingTriggerMode)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.isCommandMode)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.islandPresentation.state)
    }

    @ViewBuilder
    private var islandRightControl: some View {
        switch visualState {
        case .listening:
            IslandControlButton(
                accessibilityLabel: "Finish recording",
                fill: Theme.Color.stopButtonFill,
                action: onStopButtonPressed
            ) {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.stopButtonGlyph)
            }
        case .confirm:
            IslandControlCircle(fill: Theme.Color.confirmButtonFill) {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Color.confirmButtonGlyph)
            }
            .accessibilityLabel("Done")
        case .idle, .processing, .error:
            EmptyView()
        }
    }

    private var controlTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .scale(scale: 0.86).combined(with: .opacity)
    }
}

// MARK: - Transcribing Indicator

private struct IslandControlButton<Content: View>: View {
    let accessibilityLabel: String
    let fill: Color
    let action: () -> Void
    let content: () -> Content

    var body: some View {
        Button(action: action) {
            IslandControlCircle(fill: fill, content: content)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct IslandControlCircle<Content: View>: View {
    let fill: Color
    let content: () -> Content

    var body: some View {
        content()
            .frame(width: 22, height: 22, alignment: .center)
            .background(Circle().fill(fill))
    }
}

struct CommandModeIndicator: View {
    var body: some View {
        Image(systemName: "pencil")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.92))
            .frame(width: 14, height: 14, alignment: .center)
    }
}

struct IslandProgressView: View {
    let presentation: RecordingIslandPresentation

    var body: some View {
        HStack(spacing: 6) {
            if presentation.visualState == .processing {
                ProcessingIndicatorView()
                    .accessibilityLabel(presentation.title)

                if presentation.state != .processingUploading && presentation.state != .inserting {
                    Text(presentation.title)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: 82, alignment: .leading)
                }
            } else {
                Image(systemName: presentation.systemImageName)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(width: 15)

                Text(presentation.title)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .frame(maxWidth: 62, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

struct IslandFeedbackView: View {
    let presentation: RecordingIslandPresentation
    let onRecoveryActionPressed: (RecordingIslandAction) -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: presentation.systemImageName)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 18, height: 18)
                .background(Circle().fill(iconBackground))

            Text(presentation.title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.68)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let primaryAction = presentation.primaryAction {
                recoveryButton(for: primaryAction, isPrimary: true)
            }

            if let secondaryAction = presentation.secondaryAction {
                recoveryButton(for: secondaryAction, isPrimary: false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func recoveryButton(for action: RecordingIslandAction, isPrimary: Bool) -> some View {
        Button(action: { onRecoveryActionPressed(action) }) {
            Text(action.compactTitle)
                .font(.system(size: 9.5, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(isPrimary ? Color.black : Color.white)
                .padding(.horizontal, 6)
                .frame(height: 19)
                .background(
                    Capsule().fill(isPrimary ? Color.white : Color.white.opacity(0.18))
                )
        }
        .buttonStyle(.plain)
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel(action.compactTitle)
    }

    private var iconBackground: Color {
        switch presentation.state {
        case .success:
            return Color.green.opacity(0.9)
        case .recorderBusy:
            return Color.white.opacity(0.2)
        case .onboardingBlocked, .signedOut, .termsRequired, .trialExhausted,
             .paymentFailed, .accountBlocked, .microphoneRecovery,
             .accessibilityRecovery, .hotkeyUnavailable, .hotkeyConflict,
             .durationLimitReached, .insertionUnavailable, .fallbackCopied,
             .insertionFailed, .rateLimited, .networkError, .providerError,
             .invalidAudio, .serviceError, .unsafeRetryRequired:
            return Color.red.opacity(0.92)
        case .hiddenIdle, .accountRefreshing, .recordingHold, .recordingToggle,
             .nearingDurationLimit, .processingUploading, .inserting:
            return Color.white.opacity(0.2)
        }
    }
}

struct UpdateAvailableOverlayView: View {
    let onPress: () -> Void

    var body: some View {
        Button(action: onPress) {
            HStack(spacing: 7) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)

                Text("Update Available")
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(.plain)
    }
}
