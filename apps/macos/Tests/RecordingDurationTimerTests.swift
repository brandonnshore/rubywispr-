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
private struct RecordingDurationTimerTests {
    static func main() {
        productionPolicyMatchesDurationCapContract()
        holdModeEmitsNormalWarningAndCapReached()
        toggleModeEmitsNormalWarningAndCapReached()
        modeCanSwitchWhileTimerRemainsActive()
        monitorUsesShortenedPolicyAndVirtualClock()

        print("RecordingDurationTimerTests passed")
    }

    private static func productionPolicyMatchesDurationCapContract() {
        let policy = RecordingDurationPolicy.production

        expect(policy.warningThresholdMs == 570_000, "production warning threshold should be 9:30")
        expect(policy.limitMs == 600_000, "production duration limit should be 10:00")
        expect(policy.category == .productionPolicy, "production policy should use a metadata-only category")
    }

    private static func holdModeEmitsNormalWarningAndCapReached() {
        var tracker = RecordingDurationTracker(policy: .shortenedUnitTimer)

        let started = tracker.start(mode: .hold, nowMs: 10_000)
        expect(started.state == .normal, "hold timer should start normal")
        expect(started.mode == .hold, "hold timer should keep hold mode")
        expect(started.islandStateName == "recording_hold", "hold normal state should map to hold island state")
        expect(started.elapsedBucket == .underWarning, "hold normal state should use under-warning bucket")

        let warning = tracker.snapshot(nowMs: 10_700)
        expect(warning.state == .nearingLimit, "hold timer should warn at shortened threshold")
        expect(warning.elapsedMs == 700, "hold warning should carry numeric elapsed milliseconds")
        expect(warning.islandStateName == "nearing_duration_limit", "hold warning should map to island warning state")
        expect(warning.elapsedBucket == .warningWindow, "hold warning should use warning-window bucket")

        let cap = tracker.snapshot(nowMs: 11_000)
        expect(cap.state == .capReached, "hold timer should emit cap reached at shortened cap")
        expect(cap.elapsedMs == 1_000, "hold cap should carry numeric elapsed milliseconds")
        expect(cap.islandStateName == "duration_limit_reached", "hold cap should map to duration limit state")
        expect(cap.elapsedBucket == .overLimit, "hold cap should use over-limit bucket")
    }

    private static func toggleModeEmitsNormalWarningAndCapReached() {
        var tracker = RecordingDurationTracker(policy: .shortenedUnitTimer)

        let started = tracker.start(mode: .toggle, nowMs: 0)
        expect(started.state == .normal, "toggle timer should start normal")
        expect(started.mode == .toggle, "toggle timer should keep toggle mode")
        expect(started.islandStateName == "recording_toggle", "toggle normal state should map to toggle island state")

        let beforeWarning = tracker.snapshot(nowMs: 699)
        expect(beforeWarning.state == .normal, "toggle timer should remain normal before warning threshold")
        expect(beforeWarning.elapsedBucket == .underWarning, "toggle timer before warning should use under-warning bucket")

        let warning = tracker.snapshot(nowMs: 700)
        expect(warning.state == .nearingLimit, "toggle timer should warn at shortened threshold")
        expect(warning.mode == .toggle, "toggle warning should keep toggle mode")

        let cap = tracker.snapshot(nowMs: 1_000)
        expect(cap.state == .capReached, "toggle timer should emit cap reached at shortened cap")
        expect(cap.policyCategory == .shortenedUnitTimer, "toggle timer should expose shortened unit profile category")
    }

    private static func modeCanSwitchWhileTimerRemainsActive() {
        var tracker = RecordingDurationTracker(policy: .shortenedUnitTimer)

        _ = tracker.start(mode: .hold, nowMs: 100)
        let switched = tracker.updateMode(.toggle, nowMs: 250)

        expect(switched.mode == .toggle, "active timer should support hold-to-toggle mode switch")
        expect(switched.elapsedMs == 150, "mode switch should preserve elapsed timer baseline")
        expect(switched.state == .normal, "mode switch before threshold should stay normal")
        expect(switched.islandStateName == "recording_toggle", "mode switch should update island state category")
    }

    private static func monitorUsesShortenedPolicyAndVirtualClock() {
        var nowMs = 1_000
        let monitor = RecordingDurationMonitor(
            policy: .shortenedUnitTimer,
            tickIntervalMs: 50,
            nowMs: { nowMs }
        )
        var snapshots: [RecordingDurationSnapshot] = []
        monitor.onSnapshot = { snapshots.append($0) }

        monitor.start(mode: .hold)
        nowMs = 1_699
        monitor.tick()
        nowMs = 1_700
        monitor.tick()
        nowMs = 2_000
        monitor.tick()
        let stopped = monitor.stop()
        let stateTransitions = snapshots.map(\.state).reduce(into: [RecordingDurationState]()) { transitions, state in
            if transitions.last != state {
                transitions.append(state)
            }
        }

        expect(
            stateTransitions == [.normal, .nearingLimit, .capReached, .inactive],
            "monitor should emit normal, warning, cap, and inactive without waiting for production thresholds"
        )
        expect(stopped.state == .inactive, "monitor stop should reset to inactive")
        expect(snapshots[0].policyCategory == .shortenedUnitTimer, "monitor should expose shortened test profile category")
        expect(snapshots[2].durationLimitMs == 1_000, "monitor cap snapshot should expose numeric test limit")
    }
}
