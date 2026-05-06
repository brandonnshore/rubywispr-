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
    var beforeReturn: (() async -> Void)?

    init(_ result: DirectInsertionWriteResult = .accepted) {
        self.result = result
    }

    func insertFinalText(_ finalText: String, into targetCategory: DirectInsertionTargetCategory) async -> DirectInsertionWriteResult {
        insertedTextValues.append(finalText)
        targetCategories.append(targetCategory)
        afterInsert?()
        await beforeReturn?()
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

private final class AsyncRelease {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Never>?
    private var released = false

    func wait() async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if released {
                lock.unlock()
                continuation.resume()
            } else {
                self.continuation = continuation
                lock.unlock()
            }
        }
    }

    func release() {
        lock.lock()
        released = true
        let continuation = continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume()
    }
}

@main
private struct DirectInsertionCoordinatorTests {
    static func main() async throws {
        await testAllowedTargetInsertsAndMapsHistory()
        await testEveryAllowedTargetCategoryCanInsert()
        await testFinalTextAndAppStateGatesPreventInsertion()
        await testDuplicateAttemptFailsClosedBeforeTargetInspection()
        await testDeniedPermissionFailsClosedBeforeTargetInspection()
        await testPermissionFailureCategoriesFailClosed()
        await testUnsafeTargetCategoriesDoNotAttemptInsertion()
        await testUnavailableFocusedTargetMapsCategorically()
        await testAmbiguousTargetClassificationIsTerminal()
        await testFailedAndAmbiguousWriteResultsAreTerminal()
        await testTimeoutsMapToAmbiguous()
        try await testResultsAndEventsAreCategoricalOnly()
        try await testFailureResultsAndEventsAreCategoricalOnly()

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

    private static func testEveryAllowedTargetCategoryCanInsert() async {
        for targetCategory in [
            DirectInsertionTargetCategory.plainTextEditor,
            .richTextEditor,
            .browserTextField,
            .messagingDraftField,
            .emailDraftField,
            .codeEditor,
        ] {
            let classifier = MockTargetClassifier(.allowed(targetCategory))
            let insertion = MockInsertionPort(.accepted)
            let coordinator = makeCoordinator(classifier: classifier, insertion: insertion)

            let result = await coordinator.attempt(DirectInsertionRequest(finalText: "final_text_placeholder_allowed_category"))

            expect(result.state == .inserted, "\(targetCategory.rawValue) should be eligible for direct insertion")
            expect(result.outcome == .directInsertionSucceeded, "\(targetCategory.rawValue) should map to success")
            expect(result.targetCategory == targetCategory, "\(targetCategory.rawValue) should stay categorical")
            expect(insertion.targetCategories == [targetCategory], "\(targetCategory.rawValue) should be passed as metadata")
        }
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

    private static func testDuplicateAttemptFailsClosedBeforeTargetInspection() async {
        let releaseFirstAttempt = AsyncRelease()
        let permission = MockPermissionPort()
        let firstClassifier = MockTargetClassifier(.allowed(.plainTextEditor))
        let insertion = MockInsertionPort(.accepted)
        insertion.beforeReturn = {
            await releaseFirstAttempt.wait()
        }
        let attemptGate = DirectInsertionAttemptGate()
        let coordinator = makeCoordinator(
            permission: permission,
            classifier: firstClassifier,
            insertion: insertion,
            gate: attemptGate
        )
        let firstAttempt = Task {
            await coordinator.attempt(DirectInsertionRequest(
                requestId: "request_id_placeholder_duplicate_first",
                finalText: "final_text_placeholder_duplicate_first"
            ))
        }

        while insertion.callCount == 0 {
            await Task.yield()
        }

        let duplicateClassifier = MockTargetClassifier(.allowed(.browserTextField))
        let duplicateInsertion = MockInsertionPort(.accepted)
        let duplicate = await makeCoordinator(
            permission: permission,
            classifier: duplicateClassifier,
            insertion: duplicateInsertion,
            gate: attemptGate
        ).attempt(DirectInsertionRequest(
            requestId: "request_id_placeholder_duplicate_second",
            finalText: "final_text_placeholder_duplicate_second"
        ))

        expect(duplicate.state == .blocked, "duplicate insertion attempt should be blocked")
        expect(duplicate.outcome == .insertionUnavailable, "duplicate insertion attempt should use unavailable outcome")
        expect(duplicate.reason == .duplicateAttempt, "duplicate insertion attempt should be categorical")
        expect(duplicate.localHistoryStatus == nil, "duplicate insertion attempt should not create a second recovery record")
        expect(duplicateClassifier.callCount == 0, "duplicate insertion attempt must not inspect target")
        expect(duplicateInsertion.callCount == 0, "duplicate insertion attempt must not write text")

        releaseFirstAttempt.release()
        let first = await firstAttempt.value
        expect(first.state == .inserted, "original insertion should complete after duplicate is blocked")
        expect(insertion.callCount == 1, "original insertion should only write once")
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

    private static func testPermissionFailureCategoriesFailClosed() async {
        for permissionCategory in [
            DirectInsertionPermissionCategory.denied,
            .unavailable,
            .policyBlocked,
        ] {
            let permission = MockPermissionPort(permissionCategory)
            let classifier = MockTargetClassifier(.allowed(.plainTextEditor))
            let insertion = MockInsertionPort(.accepted)
            let result = await makeCoordinator(
                permission: permission,
                classifier: classifier,
                insertion: insertion
            ).attempt(DirectInsertionRequest(finalText: "final_text_placeholder_permission_category"))

            expect(result.state == .blocked, "\(permissionCategory.rawValue) permission should be blocked")
            expect(result.outcome == .insertionUnavailable, "\(permissionCategory.rawValue) permission should be unavailable")
            expect(result.permissionCategory == permissionCategory, "\(permissionCategory.rawValue) should stay categorical")
            expect(classifier.callCount == 0, "\(permissionCategory.rawValue) permission must not inspect target")
            expect(insertion.callCount == 0, "\(permissionCategory.rawValue) permission must not attempt insertion")
        }
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

    private static func testAmbiguousTargetClassificationIsTerminal() async {
        let classifier = MockTargetClassifier(.ambiguous)
        let insertion = MockInsertionPort(.accepted)
        let result = await makeCoordinator(classifier: classifier, insertion: insertion)
            .attempt(DirectInsertionRequest(finalText: "final_text_placeholder_ambiguous_target"))

        expect(result.state == .ambiguous, "ambiguous classification should be ambiguous")
        expect(result.outcome == .directInsertionAmbiguous, "ambiguous classification should use ambiguous outcome")
        expect(result.reason == .targetAmbiguous, "ambiguous classification reason should be categorical")
        expect(result.localHistoryStatus == .insertionFailed, "ambiguous classification should feed recovery history")
        expect(insertion.callCount == 0, "ambiguous classification must not attempt insertion")
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

    private static func testResultsAndEventsAreCategoricalOnly() async throws {
        let sink = FixtureEventSink()
        let targetPayload = "fixture_target_payload_alpha"
        let selectedPayload = "fixture_selected_payload_beta"
        let clipboardPayload = "fixture_clipboard_payload_gamma"
        let finalText = "fixture_final_payload_delta"
        let coordinator = makeCoordinator(sink: sink)

        let result = await coordinator.attempt(DirectInsertionRequest(
            requestId: "request_id_placeholder_privacy",
            finalText: finalText
        ))

        let metadata = DirectInsertionPrivacyFixtureMetadata(
            result: result,
            events: sink.events,
            destinationAppCategory: result.destinationAppCategory
        )
        guard let data = try? JSONEncoder().encode(metadata),
              let encoded = String(data: data, encoding: .utf8) else {
            expect(false, "result metadata and events should encode for privacy inspection")
            return
        }

        expect(encoded.contains("direct_insertion_succeeded"), "metadata should include categorical outcome")
        expect(encoded.contains("plain_text_editor"), "metadata should include support-safe target category")
        expect(encoded.contains("trusted"), "metadata should include permission category")
        for forbidden in [
            targetPayload,
            selectedPayload,
            clipboardPayload,
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
            expect(!encoded.localizedCaseInsensitiveContains(forbidden), "metadata should not include \(forbidden)")
        }
    }

    private static func testFailureResultsAndEventsAreCategoricalOnly() async throws {
        let sink = FixtureEventSink()
        let finalText = "fixture_final_payload_failure"
        let coordinator = makeCoordinator(
            insertion: MockInsertionPort(.rejected),
            sink: sink
        )

        let result = await coordinator.attempt(DirectInsertionRequest(
            requestId: "request_id_placeholder_privacy_failure",
            finalText: finalText
        ))

        let metadata = DirectInsertionPrivacyFixtureMetadata(
            result: result,
            events: sink.events,
            destinationAppCategory: result.destinationAppCategory
        )
        guard let data = try? JSONEncoder().encode(metadata),
              let encoded = String(data: data, encoding: .utf8) else {
            expect(false, "failure metadata and events should encode for privacy inspection")
            return
        }

        expect(encoded.contains("direct_insertion_failed"), "failure metadata should include categorical outcome")
        expect(encoded.contains("deterministic_failure"), "failure metadata should include categorical reason")
        expect(encoded.contains("plain_text_editor"), "failure metadata should include support-safe target category")
        for forbidden in [
            finalText,
            "clipboard_fallback_text_placeholder_private",
            "previous_clipboard_placeholder_private",
            "local_history_placeholder_private",
            "audio_payload_placeholder_private",
            "raw_transcript_placeholder_private",
            "app_context_placeholder_private",
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
            expect(!encoded.localizedCaseInsensitiveContains(forbidden), "failure metadata should not include \(forbidden)")
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
        clock: DirectInsertionClock = FixtureClock(),
        gate: DirectInsertionAttemptGate = DirectInsertionAttemptGate()
    ) -> DirectInsertionCoordinator {
        DirectInsertionCoordinator(
            permissionPort: permission,
            targetClassifier: classifier,
            insertionPort: insertion,
            eventSink: sink,
            clock: clock,
            attemptGate: gate
        )
    }
}

private struct DirectInsertionPrivacyFixtureMetadata: Codable {
    var result: DirectInsertionResult
    var events: [DirectInsertionEvent]
    var destinationAppCategory: String?
}

private extension MockInsertionPort {
    var callCount: Int {
        insertedTextValues.count
    }
}
