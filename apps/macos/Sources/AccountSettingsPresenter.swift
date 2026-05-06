import Foundation

struct AccountSettingsPresentation: Equatable {
    struct Row: Identifiable, Equatable {
        var id: String { title }
        var title: String
        var value: String
    }

    struct RecoveryButton: Equatable {
        var title: String
        var systemImage: String
        var action: RubyWhisperDesktopRecoveryAction
    }

    var statusTitle: String
    var statusDetail: String
    var stateCode: String
    var isLoading: Bool
    var statusRows: [Row]
    var planRows: [Row]
    var usageRows: [Row]
    var recoveryButton: RecoveryButton?

    init(
        snapshot: RubyWhisperDesktopAccountSnapshot,
        coordinatorState: DesktopAuthCoordinatorState,
        statusTitle: String,
        statusDetail: String
    ) {
        self.statusTitle = statusTitle
        self.statusDetail = statusDetail
        self.stateCode = coordinatorState.rawValue
        self.isLoading = coordinatorState == .accountRefreshing
        self.statusRows = Self.makeStatusRows(snapshot: snapshot, coordinatorState: coordinatorState)
        self.planRows = Self.makePlanRows(snapshot: snapshot, coordinatorState: coordinatorState)
        self.usageRows = Self.makeUsageRows(snapshot: snapshot)
        self.recoveryButton = Self.makeRecoveryButton(snapshot: snapshot, coordinatorState: coordinatorState)
    }

    private static func makeStatusRows(
        snapshot: RubyWhisperDesktopAccountSnapshot,
        coordinatorState: DesktopAuthCoordinatorState
    ) -> [Row] {
        var rows: [Row] = [
            Row(title: "State", value: coordinatorState.rawValue),
        ]

        if let email = sanitized(snapshot.email) {
            rows.append(Row(title: "Email", value: email))
        }
        if let recovery = snapshot.recovery {
            rows.append(Row(title: "Recovery", value: recovery.rawValue))
        } else if let button = makeRecoveryButton(snapshot: snapshot, coordinatorState: coordinatorState) {
            rows.append(Row(title: "Recovery", value: button.action.rawValue))
        }
        if let failureCode = snapshot.failureCode {
            rows.append(Row(title: "Failure code", value: failureCode.rawValue))
        }
        if let requestId = sanitized(snapshot.requestId) {
            rows.append(Row(title: "Request ID", value: requestId))
        }

        return rows
    }

    private static func makePlanRows(
        snapshot: RubyWhisperDesktopAccountSnapshot,
        coordinatorState: DesktopAuthCoordinatorState
    ) -> [Row] {
        var rows: [Row] = [
            Row(title: "Category", value: categoryLabel(snapshot: snapshot, coordinatorState: coordinatorState)),
            Row(title: "Account status", value: accountStatusLabel(snapshot.accountStatus, coordinatorState: coordinatorState)),
            Row(title: "Plan state", value: planStateLabel(snapshot.planState, coordinatorState: coordinatorState)),
        ]

        if let termsAccepted = snapshot.termsAccepted {
            rows.append(Row(title: "Terms", value: termsAccepted ? "Accepted" : "Required"))
        }
        if let billingPortalAvailable = snapshot.billingPortalAvailable,
           snapshot.planState == .paidActive || snapshot.planState == .paymentFailed {
            rows.append(Row(title: "Billing recovery", value: billingPortalAvailable ? "Available" : "Unavailable"))
        }

        return rows
    }

    private static func makeUsageRows(snapshot: RubyWhisperDesktopAccountSnapshot) -> [Row] {
        var rows: [Row] = []

        if snapshot.trialWordsUsed != nil ||
            snapshot.trialWordsRemaining != nil ||
            snapshot.trialWordsLimit != nil {
            rows.append(Row(title: "Trial used", value: countLabel(snapshot.trialWordsUsed)))
            rows.append(Row(title: "Trial remaining", value: countLabel(snapshot.trialWordsRemaining)))
            rows.append(Row(title: "Trial limit", value: countLabel(snapshot.trialWordsLimit)))
            rows.append(Row(title: "Trial status", value: trialStatusLabel(snapshot: snapshot)))
        } else {
            rows.append(Row(title: "Trial usage", value: "Not available"))
        }

        if let monthlyWordsUsed = snapshot.monthlyWordsUsed {
            rows.append(Row(title: "Monthly words", value: countLabel(monthlyWordsUsed)))
        }
        if let monthlyPeriodStart = sanitized(snapshot.monthlyPeriodStart) {
            rows.append(Row(title: "Monthly period", value: monthlyPeriodStart))
        }
        if let lifetimeWordsUsed = snapshot.lifetimeWordsUsed {
            rows.append(Row(title: "Lifetime words", value: countLabel(lifetimeWordsUsed)))
        }

        return rows
    }

    private static func makeRecoveryButton(
        snapshot: RubyWhisperDesktopAccountSnapshot,
        coordinatorState: DesktopAuthCoordinatorState
    ) -> RecoveryButton? {
        if coordinatorState.isLoginBridgePending || coordinatorState.canTranscribe {
            return nil
        }

        if coordinatorState == .accountRefreshing {
            return RecoveryButton(title: "Refresh Account", systemImage: "arrow.clockwise", action: .retry)
        }

        let action = snapshot.recovery ?? coordinatorState.defaultRecoveryAction
        switch action {
        case .openSignIn:
            return RecoveryButton(title: "Sign In", systemImage: "safari", action: .openSignIn)
        case .openTermsAcceptance:
            return RecoveryButton(title: "Accept Terms", systemImage: "doc.text", action: .openTermsAcceptance)
        case .openCheckout:
            return RecoveryButton(title: "Choose Plan", systemImage: "cart", action: .openCheckout)
        case .openBilling:
            return RecoveryButton(title: "Open Billing", systemImage: "creditcard", action: .openBilling)
        case .openAccount:
            return RecoveryButton(title: "Open Account", systemImage: "person.crop.circle", action: .openAccount)
        case .retry, .retryAfter, .retryOrContactSupport:
            return RecoveryButton(title: "Refresh Account", systemImage: "arrow.clockwise", action: action)
        case .startNewWhisper, .recordAgain, .unknown:
            return nil
        }
    }

    private static func categoryLabel(
        snapshot: RubyWhisperDesktopAccountSnapshot,
        coordinatorState: DesktopAuthCoordinatorState
    ) -> String {
        if coordinatorState == .accountRefreshing {
            return "Loading"
        }
        if coordinatorState == .signedOut || coordinatorState == .canceled {
            return "Signed out"
        }
        if snapshot.isTrialLow == true && snapshot.state == .trialActive {
            return "Trial low"
        }

        switch snapshot.state {
        case .signedOut:
            return "Signed out"
        case .signedInTermsRequired:
            return "Terms required"
        case .trialActive:
            return "Trial active"
        case .paidActive:
            return "Paid active"
        case .friendOfRubyActive:
            return "Friend of Ruby"
        case .trialExhausted:
            return "Trial exhausted"
        case .paymentFailed:
            return "Payment failed"
        case .blocked:
            return "Blocked"
        case .durationLimitReached:
            return "Duration limit"
        case .providerError:
            return "Provider error"
        case .networkError:
            return "Network error"
        case .error:
            return "Error"
        case .unknown(let rawValue):
            return rawValue.isEmpty ? "Unknown" : rawValue
        }
    }

    private static func accountStatusLabel(
        _ status: RubyWhisperDesktopAccountStatus?,
        coordinatorState: DesktopAuthCoordinatorState
    ) -> String {
        if let status {
            return status.rawValue
        }
        if coordinatorState == .accountRefreshing {
            return "Loading"
        }
        if coordinatorState == .signedOut || coordinatorState == .canceled {
            return "Signed out"
        }
        return "Unknown"
    }

    private static func planStateLabel(
        _ planState: RubyWhisperDesktopPlanState?,
        coordinatorState: DesktopAuthCoordinatorState
    ) -> String {
        if let planState {
            return planState.rawValue
        }
        if coordinatorState == .accountRefreshing {
            return "Loading"
        }
        if coordinatorState == .signedOut || coordinatorState == .canceled {
            return "Sign in required"
        }
        return "Unknown"
    }

    private static func trialStatusLabel(snapshot: RubyWhisperDesktopAccountSnapshot) -> String {
        if snapshot.isTrialExhausted == true || snapshot.trialWordsRemaining == 0 {
            return "Exhausted"
        }
        if snapshot.isTrialLow == true {
            return "Low"
        }
        return "Available"
    }

    private static func countLabel(_ count: Int?) -> String {
        guard let count else { return "Unknown" }
        return decimalFormatter.string(from: NSNumber(value: count)) ?? "\(count)"
    }

    private static func sanitized(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    private static let decimalFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()
}
