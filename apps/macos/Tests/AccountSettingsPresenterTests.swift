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

@main
private struct AccountSettingsPresenterTests {
    static func main() {
        testPlanAndUsageRowsCoverCanonicalStates()
        testRecoveryButtonsUseSafeActions()
        testUnknownAndEmptyMetadataStayStable()
        print("AccountSettingsPresenterTests passed")
    }

    private static func testPlanAndUsageRowsCoverCanonicalStates() {
        let cases: [(name: String, snapshot: RubyWhisperDesktopAccountSnapshot, state: DesktopAuthCoordinatorState, category: String, plan: String, trialStatus: String)] = [
            (
                "signed out",
                .signedOut,
                .signedOut,
                "Signed out",
                "Sign in required",
                "Not available"
            ),
            (
                "loading",
                snapshot(state: .error, planState: nil, remaining: nil),
                .accountRefreshing,
                "Loading",
                "Loading",
                "Not available"
            ),
            (
                "trial active",
                snapshot(state: .trialActive, planState: .trialActive, remaining: 4_900, isTrialLow: false),
                .trialActive,
                "Trial active",
                "trial_active",
                "Available"
            ),
            (
                "trial low",
                snapshot(state: .trialActive, planState: .trialActive, remaining: 250, isTrialLow: true),
                .trialActive,
                "Trial low",
                "trial_active",
                "Low"
            ),
            (
                "trial exhausted",
                snapshot(state: .trialExhausted, planState: .trialExhausted, remaining: 0, isTrialExhausted: true, recovery: .openCheckout),
                .trialExhausted,
                "Trial exhausted",
                "trial_exhausted",
                "Exhausted"
            ),
            (
                "paid active",
                snapshot(state: .paidActive, planState: .paidActive, remaining: nil),
                .paidActive,
                "Paid active",
                "paid_active",
                "Not available"
            ),
            (
                "Friend of Ruby",
                snapshot(state: .friendOfRubyActive, planState: .friendOfRubyActive, remaining: nil),
                .friendOfRubyActive,
                "Friend of Ruby",
                "friend_of_ruby_active",
                "Not available"
            ),
            (
                "payment failed",
                snapshot(state: .paymentFailed, planState: .paymentFailed, remaining: nil, recovery: .openBilling, failureCode: .paymentFailed),
                .paymentFailed,
                "Payment failed",
                "payment_failed",
                "Not available"
            ),
            (
                "blocked",
                snapshot(state: .blocked, planState: .blocked, remaining: nil, recovery: .openAccount, failureCode: .accountBlocked),
                .blocked,
                "Blocked",
                "blocked",
                "Not available"
            ),
            (
                "error",
                snapshot(state: .error, planState: nil, remaining: nil, recovery: .retry, failureCode: .serviceUnavailable),
                .error,
                "Error",
                "Unknown",
                "Not available"
            ),
        ]

        for testCase in cases {
            let presentation = presentation(snapshot: testCase.snapshot, state: testCase.state)
            expect(rowValue("Category", in: presentation.planRows) == testCase.category, "\(testCase.name) should show category")
            expect(rowValue("Plan state", in: presentation.planRows) == testCase.plan, "\(testCase.name) should show plan state")
            expect(trialStatus(in: presentation.usageRows) == testCase.trialStatus, "\(testCase.name) should show trial status")
        }
    }

    private static func testRecoveryButtonsUseSafeActions() {
        let cases: [(name: String, snapshot: RubyWhisperDesktopAccountSnapshot, state: DesktopAuthCoordinatorState, action: RubyWhisperDesktopRecoveryAction?, title: String?)] = [
            ("signed out", .signedOut, .signedOut, .openSignIn, "Sign In"),
            (
                "terms",
                snapshot(state: .signedInTermsRequired, planState: .trialActive, recovery: .openTermsAcceptance, failureCode: .termsRequired),
                .signedInTermsRequired,
                .openTermsAcceptance,
                "Accept Terms"
            ),
            (
                "checkout",
                snapshot(state: .trialExhausted, planState: .trialExhausted, remaining: 0, recovery: .openCheckout),
                .trialExhausted,
                .openCheckout,
                "Choose Plan"
            ),
            (
                "billing",
                snapshot(state: .paymentFailed, planState: .paymentFailed, recovery: .openBilling, failureCode: .paymentFailed),
                .paymentFailed,
                .openBilling,
                "Open Billing"
            ),
            (
                "account",
                snapshot(state: .blocked, planState: .blocked, recovery: .openAccount, failureCode: .accountBlocked),
                .blocked,
                .openAccount,
                "Open Account"
            ),
            (
                "retry",
                snapshot(state: .error, planState: nil, recovery: .retry, failureCode: .serviceUnavailable),
                .error,
                .retry,
                "Refresh Account"
            ),
            (
                "loading",
                .signedOut,
                .accountRefreshing,
                .retry,
                "Refresh Account"
            ),
            (
                "active",
                snapshot(state: .paidActive, planState: .paidActive),
                .paidActive,
                nil,
                nil
            ),
        ]

        for testCase in cases {
            let button = presentation(snapshot: testCase.snapshot, state: testCase.state).recoveryButton
            expect(button?.action == testCase.action, "\(testCase.name) should map recovery action")
            expect(button?.title == testCase.title, "\(testCase.name) should map recovery title")
        }
    }

    private static func testUnknownAndEmptyMetadataStayStable() {
        let presentation = presentation(
            snapshot: RubyWhisperDesktopAccountSnapshot(
                state: .unknown("backend_future_state"),
                canTranscribe: false,
                recovery: .unknown("future_action"),
                retryable: false,
                email: "   ",
                termsAccepted: nil,
                accountStatus: .unknown("custom_status"),
                planState: .unknown("custom_plan")
            ),
            state: .unknown("backend_future_state")
        )

        expect(rowValue("Category", in: presentation.planRows) == "backend_future_state", "unknown state should remain metadata-only")
        expect(rowValue("Account status", in: presentation.planRows) == "custom_status", "unknown account status should show stable raw metadata")
        expect(rowValue("Plan state", in: presentation.planRows) == "custom_plan", "unknown plan state should show stable raw metadata")
        expect(rowValue("Email", in: presentation.statusRows) == nil, "blank email should not render")
        expect(presentation.recoveryButton == nil, "unknown recovery should not create an unsafe action")
    }

    private static func presentation(
        snapshot: RubyWhisperDesktopAccountSnapshot,
        state: DesktopAuthCoordinatorState
    ) -> AccountSettingsPresentation {
        AccountSettingsPresentation(
            snapshot: snapshot,
            coordinatorState: state,
            statusTitle: state.rawValue,
            statusDetail: "metadata-only"
        )
    }

    private static func snapshot(
        state: RubyWhisperDesktopState,
        planState: RubyWhisperDesktopPlanState?,
        remaining: Int? = 4_900,
        isTrialLow: Bool? = nil,
        isTrialExhausted: Bool? = nil,
        recovery: RubyWhisperDesktopRecoveryAction? = nil,
        failureCode: RubyWhisperBackendErrorCode? = nil
    ) -> RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: state,
            canTranscribe: state == .trialActive || state == .paidActive || state == .friendOfRubyActive,
            recovery: recovery,
            retryable: recovery == .retry,
            email: "user@example.test",
            termsAccepted: state != .signedInTermsRequired,
            accountStatus: state == .signedInTermsRequired ? .termsRequired : .active,
            planState: planState,
            preflightPolicy: "allow_if_started_under_limit",
            trialWordsUsed: remaining == nil ? nil : 5_000 - (remaining ?? 0),
            trialWordsRemaining: remaining,
            trialWordsLimit: remaining == nil ? nil : 5_000,
            isTrialLow: isTrialLow,
            isTrialExhausted: isTrialExhausted,
            monthlyWordsUsed: nil,
            monthlyPeriodStart: nil,
            lifetimeWordsUsed: nil,
            billingPortalAvailable: planState == .paidActive || planState == .paymentFailed,
            failureCode: failureCode
        )
    }

    private static func rowValue(
        _ title: String,
        in rows: [AccountSettingsPresentation.Row]
    ) -> String? {
        rows.first { $0.title == title }?.value
    }

    private static func trialStatus(in rows: [AccountSettingsPresentation.Row]) -> String {
        rowValue("Trial status", in: rows) ?? rowValue("Trial usage", in: rows) ?? ""
    }
}
