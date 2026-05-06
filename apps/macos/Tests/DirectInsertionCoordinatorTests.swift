import Darwin
import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

private final class MockPermissionPort: DirectInsertionPermissionPort {
    var category: DirectInsertionPermissionCategory
    private(set) var callCount = 0

    init(_ category: DirectInsertionPermissionCategory = .trusted) {
        self.category = category
    }

    func currentPermissionCategory() -> DirectInsertionPermissionCategory {
        callCount += 1
        return category
    }
}

private final class MockTargetClassifier: InsertionTargetClassifier {
    var classification: DirectInsertionTargetClassification
    private(set) var callCount = 0
    var afterClassify: (() -> Void)?

    init(_ classification: DirectInsertionTargetClassification = .allowed(.plainTextEditor)) {
        self.classification = classification
    }

    func classifyFocusedTarget() -> DirectInsertionTargetClassification {
        callCount += 1
        afterClassify?()
        return classification
    }
}

private final class MockInsertionPort: DirectInsertionPort {
    var result: DirectInsertionWriteResult
    private(set) var insertedTextValues: [String] = []
    private(set) var targetCategories: [DirectInsertionTargetCategory] = []
    var afterInsert: (() -> Void)?

    init(_ result: DirectInsertionWriteResult = .accepted) {
        self.result = result
    }

    func insertFinalText(_ finalText: String, into targetCategory: DirectInsertionTargetCategory) async -> DirectInsertionWriteResult {
        insertedTextValues.append(finalText)
        targetCategories.append(targetCategory)
        afterInsert?()
        return result
    }
}

private final class FixtureEventSink: DirectInsertionEventSink {
    private(set) var events: [DirectInsertionEvent] = []

    func record(_ event: DirectInsertionEvent) {
        events.append(event)
    }
}

private final class FixtureClock: DirectInsertionClock {
    private var current: Date

    init(_ timestamp: TimeInterval = 1_800_000_000) {
        self.current = Date(timeIntervalSince1970: timestamp)
    }

    func now() -> Date {
        current
    }

    func advance(_ seconds: TimeInterval) {
        current = current.addingTimeInterval(seconds)
    }
}

@main
private struct DirectInsertionCoordinatorTests {
    static func main() async throws {
        await testAllowedTargetInsertsAndMapsHistory()
        await testFinalTextAndAppStateGatesPreventInsertion()
        await testDeniedPermissionFailsClosedBeforeTargetInspection()
        await testUnsafeTargetCategoriesDoNotAttemptInsertion()
        await testUnavailableFocusedTargetMapsCategorically()
        await testFailedAndAmbiguousWriteResultsAreTerminal()
        await testTimeoutsMapToAmbiguous()
        try await testEventsAreCategoricalOnly()

        print("DirectInsertionCoordinatorTests passed")
    }

    private static func testAllowedTargetInsertsAndMapsHistory() async {
        let permission = MockPermissionPort()
        let classifier = MockTargetClassifier(.allowed(.browserTextField))
        let insertion = MockInsertionPort(.accepted)
        let sink = FixtureEventSink()
        let coordinator = makeCoordinator(
            permission: permission,
            classifier: classifier,
            insertion: insertion,
            sink: sink
        )

        let result = await coordinator.attempt(DirectInsertionRequest(
            requestId: "request_id_placeholder_allowed",
            finalText: "  final_text_placeholder_allowed  "
        ))

        expect(result.state == .inserted, "allowed target should insert")
        expect(result.outcome == .directInsertionSucceeded, "inserted result should use success outcome")
        expect(result.localHistoryStatus == .inserted, "inserted result should feed Recent Wisprs inserted")
        expect(result.targetCategory == .browserTextField, "result should preserve categorical target")
        expect(insertion.insertedTextValues == ["final_text_placeholder_allowed"], "insertion should receive trimmed final text")
        expect(sink.events.map(\.outcome) == [.directInsertionSucceeded], "event should record categorical success")
    }

    private static func testFinalTextAndAppStateGatesPreventInsertion() async {
        let empty = await closedGateResult(finalText: "   ")
        expect(empty.result.state == .unavailable, "empty final text should be unavailable")
        expect(empty.result.localHistoryStatus == nil, "empty final text should not feed recovery history")
        expect(empty.insertion.callCount == 0, "empty final text must not attempt insertion")
        expect(empty.classifier.callCount == 0, "empty final text must not inspect target")

        let ineligible = await closedGateResult(finalText: "final_text_placeholder_ineligible", appEligibility: .ineligible)
        expect(ineligible.result.reason == .appIneligible, "app-ineligible gate should be categorical")
        expect(ineligible.result.localHistoryStatus == .insertionFailed, "app-ineligible final text should feed recovery history")
        expect(ineligible.insertion.callCount == 0, "app-ineligible gate must not attempt insertion")

        let notInserting = await closedGateResult(finalText: "final_text_placeholder_island", islandIsInserting: false)
        expect(notInserting.result.reason == .islandNotInserting, "island gate should be categorical")
        expect(notInserting.insertion.callCount == 0, "non-inserting island state must not attempt insertion")
    }

    private static func testDeniedPermissionFailsClosedBeforeTargetInspection() async {
        let permission = MockPermissionPort(.denied)
        let classifier = MockTargetClassifier(.allowed(.plainTextEditor))
        let insertion = MockInsertionPort(.accepted)
        let coordinator = makeCoordinator(permission: permission, classifier: classifier, insertion: insertion)

        let result = await coordinator.attempt(DirectInsertionRequest(finalText: "final_text_placeholder_permission"))

        expect(result.state == .blocked, "denied permission should be blocked")
        expect(result.outcome == .insertionUnavailable, "denied permission should use unavailable outcome")
        expect(result.reason == .permissionDenied, "denied permission should be categorical")
        expect(classifier.callCount == 0, "denied permission must not inspect focused target")
        expect(insertion.callCount == 0, "denied permission must not attempt insertion")
    }

    private static func testUnsafeTargetCategoriesDoNotAttemptInsertion() async {
        for unsafeCategory in [
            DirectInsertionUnsafeTargetCategory.secureInput,
            .readOnlyOrDisabled,
            .terminalOrShell,
            .productionOrAdminSurface,
            .privateConversationOrRealEmail,
            .unknownOrUnclassified,
        ] {
            let classifier = MockTargetClassifier(.unsafe(unsafeCategory))
            let insertion = MockInsertionPort(.accepted)
            let coordinator = makeCoordinator(classifier: classifier, insertion: insertion)

            let result = await coordinator.attempt(DirectInsertionRequest(finalText: "final_text_placeholder_unsafe"))

            expect(result.state == .blocked, "\(unsafeCategory.rawValue) should be blocked")
            expect(result.outcome == .directInsertionSkippedUnsafe, "\(unsafeCategory.rawValue) should use skipped unsafe outcome")
            expect(result.unsafeTargetCategory == unsafeCategory, "unsafe category should stay categorical")
            expect(result.localHistoryStatus == .insertionFailed, "unsafe final text should feed recovery history")
            expect(insertion.callCount == 0, "\(unsafeCategory.rawValue) must not attempt insertion")
        }
    }

    private static func testUnavailableFocusedTargetMapsCategorically() async {
        let classifier = MockTargetClassifier(.unavailable(.noFocusedTarget))
        let insertion = MockInsertionPort(.accepted)
        let coordinator = makeCoordinator(classifier: classifier, insertion: insertion)

        let result = await coordinator.attempt(DirectInsertionRequest(finalText: "final_text_placeholder_unfocused"))

        expect(result.state == .unavailable, "unfocused target should be unavailable")
        expect(result.outcome == .insertionUnavailable, "unfocused target should use unavailable outcome")
        expect(result.unsafeTargetCategory == .noFocusedTarget, "unfocused target should preserve category")
        expect(insertion.callCount == 0, "unfocused target must not attempt insertion")
    }

    private static func testFailedAndAmbiguousWriteResultsAreTerminal() async {
        let failedInsertion = MockInsertionPort(.rejected)
        let failed = await makeCoordinator(insertion: failedInsertion)
            .attempt(DirectInsertionRequest(finalText: "final_text_placeholder_failed"))
        expect(failed.state == .failed, "deterministic rejection should be failed")
        expect(failed.outcome == .directInsertionFailed, "deterministic rejection should use failed outcome")
        expect(failed.localHistoryStatus == .insertionFailed, "deterministic rejection should feed recovery history")

        let ambiguousInsertion = MockInsertionPort(.ambiguous)
        let ambiguous = await makeCoordinator(insertion: ambiguousInsertion)
            .attempt(DirectInsertionRequest(finalText: "final_text_placeholder_ambiguous"))
        expect(ambiguous.state == .ambiguous, "ambiguous write should be ambiguous")
        expect(ambiguous.outcome == .directInsertionAmbiguous, "ambiguous write should use ambiguous outcome")
        expect(ambiguous.localHistoryStatus == .insertionFailed, "ambiguous write should feed recovery history")
    }

    private static func testTimeoutsMapToAmbiguous() async {
        let preflightClock = FixtureClock()
        let preflightClassifier = MockTargetClassifier(.allowed(.plainTextEditor))
        preflightClassifier.afterClassify = { preflightClock.advance(0.300) }
        let preflightInsertion = MockInsertionPort(.accepted)
        let preflight = await makeCoordinator(
            classifier: preflightClassifier,
            insertion: preflightInsertion,
            clock: preflightClock
        ).attempt(DirectInsertionRequest(finalText: "final_text_placeholder_preflight_timeout"))

        expect(preflight.state == .ambiguous, "preflight timeout should be ambiguous")
        expect(preflight.reason == .preflightTimeout, "preflight timeout reason should be categorical")
        expect(preflightInsertion.callCount == 0, "preflight timeout must not attempt insertion")

        let attemptClock = FixtureClock()
        let attemptInsertion = MockInsertionPort(.accepted)
        attemptInsertion.afterInsert = { attemptClock.advance(1.600) }
        let attempt = await makeCoordinator(
            insertion: attemptInsertion,
            clock: attemptClock
        ).attempt(DirectInsertionRequest(finalText: "final_text_placeholder_attempt_timeout"))

        expect(attempt.state == .ambiguous, "attempt timeout should be ambiguous")
        expect(attempt.reason == .attemptTimeout, "attempt timeout reason should be categorical")
    }

    private static func testEventsAreCategoricalOnly() async throws {
        let sink = FixtureEventSink()
        let finalText = "final_text_placeholder_privacy_not_event"
        let coordinator = makeCoordinator(sink: sink)

        _ = await coordinator.attempt(DirectInsertionRequest(
            requestId: "request_id_placeholder_privacy",
            finalText: finalText
        ))

        guard let data = try? JSONEncoder().encode(sink.events),
              let encoded = String(data: data, encoding: .utf8) else {
            expect(false, "events should encode for privacy inspection")
            return
        }

        expect(encoded.contains("direct_insertion_succeeded"), "event should include categorical outcome")
        expect(encoded.contains("plain_text_editor"), "event should include support-safe target category")
        expect(encoded.contains("trusted"), "event should include permission category")
        for forbidden in [
            finalText,
            "targetText",
            "selectedText",
            "clipboard",
            "windowTitle",
            "bundleIdentifier",
            "appName",
            "rawTranscript",
            "audio",
            "providerPayload",
        ] {
            expect(!encoded.localizedCaseInsensitiveContains(forbidden), "event should not include \(forbidden)")
        }
    }

    private static func closedGateResult(
        finalText: String,
        appEligibility: DirectInsertionAppEligibility = .eligible,
        islandIsInserting: Bool = true
    ) async -> (result: DirectInsertionResult, classifier: MockTargetClassifier, insertion: MockInsertionPort) {
        let classifier = MockTargetClassifier(.allowed(.plainTextEditor))
        let insertion = MockInsertionPort(.accepted)
        let coordinator = makeCoordinator(classifier: classifier, insertion: insertion)
        let result = await coordinator.attempt(DirectInsertionRequest(
            finalText: finalText,
            appEligibility: appEligibility,
            islandIsInserting: islandIsInserting
        ))
        return (result, classifier, insertion)
    }

    private static func makeCoordinator(
        permission: MockPermissionPort = MockPermissionPort(),
        classifier: MockTargetClassifier = MockTargetClassifier(),
        insertion: MockInsertionPort = MockInsertionPort(),
        sink: FixtureEventSink = FixtureEventSink(),
        clock: DirectInsertionClock = FixtureClock()
    ) -> DirectInsertionCoordinator {
        DirectInsertionCoordinator(
            permissionPort: permission,
            targetClassifier: classifier,
            insertionPort: insertion,
            eventSink: sink,
            clock: clock
        )
    }
}

private extension MockInsertionPort {
    var callCount: Int {
        insertedTextValues.count
    }
}
