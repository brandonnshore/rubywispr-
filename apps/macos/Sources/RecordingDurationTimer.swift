import Foundation

enum RecordingDurationPolicyCategory: String, Equatable {
    case productionPolicy = "production_policy"
    case shortenedUnitTimer = "shortened_unit_timer"
    case shortenedIntegrationTimer = "shortened_integration_timer"
}

struct RecordingDurationPolicy: Equatable {
    let warningThresholdMs: Int
    let limitMs: Int
    let category: RecordingDurationPolicyCategory

    init(
        warningThresholdMs: Int,
        limitMs: Int,
        category: RecordingDurationPolicyCategory
    ) {
        precondition(warningThresholdMs >= 0, "warning threshold must be non-negative")
        precondition(limitMs > 0, "duration limit must be positive")
        precondition(warningThresholdMs < limitMs, "warning threshold must be before the duration limit")

        self.warningThresholdMs = warningThresholdMs
        self.limitMs = limitMs
        self.category = category
    }

    static let production = RecordingDurationPolicy(
        warningThresholdMs: 570_000,
        limitMs: 600_000,
        category: .productionPolicy
    )

    static let shortenedUnitTimer = RecordingDurationPolicy(
        warningThresholdMs: 700,
        limitMs: 1_000,
        category: .shortenedUnitTimer
    )

    static let shortenedIntegrationTimer = RecordingDurationPolicy(
        warningThresholdMs: 3_000,
        limitMs: 5_000,
        category: .shortenedIntegrationTimer
    )
}

enum RecordingDurationState: String, Equatable {
    case inactive
    case normal
    case nearingLimit = "nearing_limit"
    case capReached = "cap_reached"
}

enum RecordingDurationBucket: String, Equatable {
    case inactive
    case underWarning = "under_warning"
    case warningWindow = "warning_window"
    case overLimit = "over_limit"
}

struct RecordingDurationSnapshot: Equatable {
    let mode: RecordingTriggerMode?
    let state: RecordingDurationState
    let elapsedMs: Int
    let durationWarningThresholdMs: Int
    let durationLimitMs: Int
    let elapsedBucket: RecordingDurationBucket
    let policyCategory: RecordingDurationPolicyCategory

    static func inactive(policy: RecordingDurationPolicy) -> RecordingDurationSnapshot {
        RecordingDurationSnapshot(
            mode: nil,
            state: .inactive,
            elapsedMs: 0,
            durationWarningThresholdMs: policy.warningThresholdMs,
            durationLimitMs: policy.limitMs,
            elapsedBucket: .inactive,
            policyCategory: policy.category
        )
    }

    var islandStateName: String {
        switch state {
        case .inactive:
            return "inactive"
        case .normal:
            switch mode {
            case .hold:
                return "recording_hold"
            case .toggle:
                return "recording_toggle"
            case nil:
                return "recording"
            }
        case .nearingLimit:
            return "nearing_duration_limit"
        case .capReached:
            return "duration_limit_reached"
        }
    }
}

struct RecordingDurationTracker {
    private let policy: RecordingDurationPolicy
    private var startedAtMs: Int?
    private var activeMode: RecordingTriggerMode?

    init(policy: RecordingDurationPolicy = .production) {
        self.policy = policy
    }

    var isActive: Bool {
        startedAtMs != nil
    }

    mutating func start(mode: RecordingTriggerMode, nowMs: Int) -> RecordingDurationSnapshot {
        startedAtMs = nowMs
        activeMode = mode
        return snapshot(nowMs: nowMs)
    }

    mutating func updateMode(_ mode: RecordingTriggerMode, nowMs: Int) -> RecordingDurationSnapshot {
        guard isActive else {
            return RecordingDurationSnapshot.inactive(policy: policy)
        }

        activeMode = mode
        return snapshot(nowMs: nowMs)
    }

    func snapshot(nowMs: Int) -> RecordingDurationSnapshot {
        guard let startedAtMs else {
            return RecordingDurationSnapshot.inactive(policy: policy)
        }

        let elapsedMs = max(0, nowMs - startedAtMs)
        let state: RecordingDurationState
        let bucket: RecordingDurationBucket

        if elapsedMs >= policy.limitMs {
            state = .capReached
            bucket = .overLimit
        } else if elapsedMs >= policy.warningThresholdMs {
            state = .nearingLimit
            bucket = .warningWindow
        } else {
            state = .normal
            bucket = .underWarning
        }

        return RecordingDurationSnapshot(
            mode: activeMode,
            state: state,
            elapsedMs: elapsedMs,
            durationWarningThresholdMs: policy.warningThresholdMs,
            durationLimitMs: policy.limitMs,
            elapsedBucket: bucket,
            policyCategory: policy.category
        )
    }

    mutating func stop() -> RecordingDurationSnapshot {
        startedAtMs = nil
        activeMode = nil
        return RecordingDurationSnapshot.inactive(policy: policy)
    }
}

final class RecordingDurationMonitor {
    private let policy: RecordingDurationPolicy
    private let tickIntervalMs: Int
    private let queue: DispatchQueue
    private let nowMs: () -> Int
    private var tracker: RecordingDurationTracker
    private var timer: DispatchSourceTimer?
    private var lastEmittedSnapshot: RecordingDurationSnapshot

    var onSnapshot: ((RecordingDurationSnapshot) -> Void)?

    init(
        policy: RecordingDurationPolicy = .production,
        tickIntervalMs: Int = 250,
        queue: DispatchQueue = .main,
        nowMs: @escaping () -> Int = {
            Int(DispatchTime.now().uptimeNanoseconds / 1_000_000)
        }
    ) {
        precondition(tickIntervalMs > 0, "tick interval must be positive")

        self.policy = policy
        self.tickIntervalMs = tickIntervalMs
        self.queue = queue
        self.nowMs = nowMs
        self.tracker = RecordingDurationTracker(policy: policy)
        self.lastEmittedSnapshot = RecordingDurationSnapshot.inactive(policy: policy)
    }

    func start(mode: RecordingTriggerMode) {
        cancelTimer()
        emit(tracker.start(mode: mode, nowMs: nowMs()))

        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(
            deadline: .now() + .milliseconds(tickIntervalMs),
            repeating: .milliseconds(tickIntervalMs)
        )
        timer.setEventHandler { [weak self] in
            self?.tick()
        }
        self.timer = timer
        timer.resume()
    }

    func updateMode(_ mode: RecordingTriggerMode) {
        guard tracker.isActive else { return }
        emit(tracker.updateMode(mode, nowMs: nowMs()))
    }

    func tick() {
        guard tracker.isActive else { return }
        emit(tracker.snapshot(nowMs: nowMs()))
    }

    @discardableResult
    func stop() -> RecordingDurationSnapshot {
        cancelTimer()
        let snapshot = tracker.stop()
        emit(snapshot)
        return snapshot
    }

    deinit {
        cancelTimer()
    }

    private func cancelTimer() {
        timer?.cancel()
        timer = nil
    }

    private func emit(_ snapshot: RecordingDurationSnapshot) {
        guard snapshot != lastEmittedSnapshot else { return }
        lastEmittedSnapshot = snapshot
        onSnapshot?(snapshot)
    }
}
