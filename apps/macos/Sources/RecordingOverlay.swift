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
    static let compactWidth: CGFloat = 180
    static let recoveryWidth: CGFloat = 228
    static let baseHeight: CGFloat = 38
    static let screenMargin: CGFloat = 8
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
    panel.isMovableByWindowBackground = true
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.isReleasedWhenClosed = false
    panel.hidesOnDeactivate = false
    return panel
}

private func makeNotchContent<V: View>(
    width: CGFloat,
    height: CGFloat,
    cornerRadius: CGFloat,
    rootView: V
) -> NSView {
    let shaped = rootView
        .frame(width: width, height: height)
        .background(Color.black)
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: cornerRadius, bottomTrailingRadius: cornerRadius))

    let hosting = NSHostingView(rootView: shaped)
    hosting.frame = NSRect(x: 0, y: 0, width: width, height: height)
    hosting.autoresizingMask = [.width, .height]
    return hosting
}

// MARK: - Manager

final class RecordingOverlayManager {
    private var overlayWindow: NSPanel?
    private let overlayState = RecordingOverlayState()
    private var overlayTopCenterAnchor: NSPoint?

    var onStopButtonPressed: (() -> Void)?
    var onUpdateOverlayPressed: (() -> Void)?
    var onRecoveryActionPressed: ((RecordingIslandAction) -> Void)?

    private var screenHasNotch: Bool {
        guard let screen = NSScreen.main else { return false }
        return screen.safeAreaInsets.top > 0
    }

    private var notchWidth: CGFloat {
        guard let screen = NSScreen.main, screenHasNotch else { return 0 }
        guard let leftArea = screen.auxiliaryTopLeftArea,
              let rightArea = screen.auxiliaryTopRightArea else { return 0 }
        return screen.frame.width - leftArea.width - rightArea.width
    }

    private var notchOverlap: CGFloat {
        guard let screen = NSScreen.main else { return 0 }
        return screen.frame.maxY - screen.visibleFrame.maxY
    }

    private var shouldReduceMotion: Bool {
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
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
            self.showIslandPresentation(RecordingIslandStateMachine.success(), animatedResize: true)
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
        preserveCurrentAnchor()
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

        guard let screen = NSScreen.main else { return }

        let hiddenFrame = NSRect(x: frame.origin.x, y: screen.frame.maxY, width: frame.width, height: frame.height)
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
        preserveCurrentAnchor()
        let frame = overlayFrame
        panel.ignoresMouseEvents = false
        panel.contentView = makeOverlayContent(frame: frame)
        resize(panel: panel, to: frame, animated: animated)
    }

    private func makeOverlayContent(frame: NSRect) -> NSView {
        makeNotchContent(
            width: frame.width,
            height: frame.height,
            cornerRadius: screenHasNotch ? 18 : 12,
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
            .padding(.top, screenHasNotch ? notchOverlap : 0)
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
        guard let screen = NSScreen.main else { return .zero }
        let width = overlayWidth
        let overlap = screenHasNotch ? notchOverlap : 0
        let height: CGFloat = RecordingOverlayGeometry.baseHeight + overlap
        let anchor = overlayTopCenterAnchor ?? defaultTopCenterAnchor(on: screen)
        let proposedX = anchor.x - width / 2
        let proposedY = anchor.y - height
        let x = clamp(
            proposedX,
            minimum: screen.visibleFrame.minX + RecordingOverlayGeometry.screenMargin,
            maximum: screen.visibleFrame.maxX - width - RecordingOverlayGeometry.screenMargin
        )
        let y = clamp(
            proposedY,
            minimum: screen.visibleFrame.minY + RecordingOverlayGeometry.screenMargin,
            maximum: screen.frame.maxY - height
        )
        return NSRect(x: x, y: y, width: width, height: height)
    }

    private var overlayWidth: CGFloat {
        let baseWidth = overlayState.phase == .updateAvailable || overlayState.islandPresentation.usesRecoveryLayout
            ? RecordingOverlayGeometry.recoveryWidth
            : RecordingOverlayGeometry.compactWidth
        guard screenHasNotch else { return baseWidth }
        return max(notchWidth, baseWidth)
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
        preserveCurrentAnchor()
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
        overlayTopCenterAnchor = NSPoint(x: panel.frame.midX, y: panel.frame.maxY)
    }

    private func defaultTopCenterAnchor(on screen: NSScreen) -> NSPoint {
        NSPoint(x: screen.frame.midX, y: screen.frame.maxY)
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
    private let maxHeight: CGFloat = 20

    var body: some View {
        Capsule()
            .fill(.white)
            .frame(width: 3, height: minHeight + (maxHeight - minHeight) * amplitude)
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
        .frame(height: 20)
    }

    private func reducedMotionBars() -> some View {
        let level = CGFloat(max(min(audioLevel, 1), 0))
        let tickLevel = (level * 4).rounded(.down) / 4

        return HStack(spacing: 3) {
            ForEach(0..<Self.barCount, id: \.self) { index in
                WaveformBar(amplitude: min(tickLevel * Self.multipliers[index], 1.0))
            }
        }
    }

    private func waveformBars(pulseTime: TimeInterval?) -> some View {
        HStack(spacing: 2.5) {
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

struct ProcessingWaveformView: View {
    private static let barCount = 5
    private static let centerIndex = CGFloat((barCount - 1) / 2)

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
            let time = context.date.timeIntervalSinceReferenceDate

            HStack(spacing: 4) {
                ForEach(0..<Self.barCount, id: \.self) { index in
                    ProcessingPill(
                        amplitude: amplitude(for: index, time: time),
                        opacity: opacity(for: index, time: time)
                    )
                }
            }
            .frame(height: 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func phase(for index: Int, time: TimeInterval) -> Double {
        let cycle = 1.05
        let stagger = 0.11
        return ((time - Double(index) * stagger).truncatingRemainder(dividingBy: cycle)) / cycle
    }

    private func pulse(for index: Int, time: TimeInterval) -> CGFloat {
        let phase = phase(for: index, time: time)
        let wave = 0.5 + 0.5 * sin((phase * 2.0 * .pi) - (.pi / 2.0))
        return CGFloat(pow(wave, 1.9))
    }

    private func amplitude(for index: Int, time: TimeInterval) -> CGFloat {
        let centerDistance = abs(CGFloat(index) - Self.centerIndex) / Self.centerIndex
        let baseline = 0.18 + (1.0 - centerDistance) * 0.1
        return min(baseline + pulse(for: index, time: time) * 0.68, 1.0)
    }

    private func opacity(for index: Int, time: TimeInterval) -> CGFloat {
        0.42 + pulse(for: index, time: time) * 0.52
    }
}

private struct ProcessingPill: View {
    let amplitude: CGFloat
    let opacity: CGFloat

    private let minHeight: CGFloat = 4
    private let maxHeight: CGFloat = 18

    var body: some View {
        Capsule()
            .fill(.white)
            .frame(width: 4, height: minHeight + (maxHeight - minHeight) * amplitude)
            .opacity(opacity)
    }
}

struct ProcessingIndicatorView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showsExtendedSpinner = false
    @State private var rotation: Double = 0

    var body: some View {
        ZStack {
            if reduceMotion {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.88))
                    .frame(height: 20)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if showsExtendedSpinner {
                Circle()
                    .trim(from: 0.1, to: 0.9)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .frame(width: 16, height: 16)
                    .rotationEffect(.degrees(rotation))
                    .frame(height: 20)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
                    .onAppear {
                        rotation = 0
                        withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) {
                            rotation = 360
                        }
                    }
            } else {
                ProcessingWaveformView()
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .task {
            guard !reduceMotion else { return }
            showsExtendedSpinner = false
            do {
                try await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                withAnimation(.easeInOut(duration: 0.18)) {
                    showsExtendedSpinner = true
                }
            } catch {}
        }
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

struct RecordingOverlayView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject var state: RecordingOverlayState
    let onStopButtonPressed: () -> Void
    let onUpdateOverlayPressed: () -> Void
    let onRecoveryActionPressed: (RecordingIslandAction) -> Void

    private let leadingAccessoryWidth: CGFloat = 24
    private let trailingAccessoryWidth: CGFloat = 32

    private var showsLiveRecordingContent: Bool {
        state.islandPresentation.showsVisualizer
    }

    private var showsStopButton: Bool {
        showsLiveRecordingContent && state.recordingTriggerMode == .toggle
    }

    var body: some View {
        Group {
            if state.phase == .feedback {
                IslandFeedbackView(
                    presentation: state.islandPresentation,
                    onRecoveryActionPressed: onRecoveryActionPressed
                )
            } else if state.phase == .updateAvailable {
                UpdateAvailableOverlayView(onPress: onUpdateOverlayPressed)
            } else {
                ZStack {
                    Group {
                        if state.phase == .initializing {
                            InitializingDotsView()
                                .transition(.opacity)
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
                            if state.isCommandMode {
                                CommandModeIndicator()
                                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
                            }
                        }
                        .frame(width: leadingAccessoryWidth, alignment: .center)
                        .frame(maxHeight: .infinity, alignment: .center)

                        Spacer(minLength: 0)

                        Group {
                            if showsStopButton {
                                Button(action: onStopButtonPressed) {
                                    Image(systemName: "stop.fill")
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(Color.red.opacity(0.92)))
                                }
                                .buttonStyle(.plain)
                                .transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))
                            }
                        }
                        .frame(width: trailingAccessoryWidth, alignment: .trailing)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.phase)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.recordingTriggerMode)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.isCommandMode)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.8), value: state.islandPresentation.state)
    }
}

// MARK: - Transcribing Indicator

struct CommandModeIndicator: View {
    var body: some View {
        Image(systemName: "pencil")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white.opacity(0.92))
            .frame(width: 16, height: 16, alignment: .center)
    }
}

struct IslandProgressView: View {
    let presentation: RecordingIslandPresentation

    var body: some View {
        ZStack {
            ProcessingIndicatorView()

            HStack {
                Image(systemName: presentation.systemImageName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(width: 22)

                Spacer(minLength: 0)

                Text(presentation.title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .frame(maxWidth: 92, alignment: .trailing)
            }
        }
    }
}

struct IslandFeedbackView: View {
    let presentation: RecordingIslandPresentation
    let onRecoveryActionPressed: (RecordingIslandAction) -> Void

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: presentation.systemImageName)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(Circle().fill(iconBackground))

            Text(presentation.title)
                .font(.system(size: 11, weight: .semibold))
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
                .font(.system(size: 10, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(isPrimary ? Color.black : Color.white)
                .padding(.horizontal, 7)
                .frame(height: 21)
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
