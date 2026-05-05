import Combine
import Foundation

enum DesktopAuthCoordinatorState: Equatable, RawRepresentable, Codable, CustomStringConvertible {
    case signedOut
    case loginLaunching
    case browserPending
    case handoffPending
    case sessionExchanging
    case accountRefreshing
    case signedInTermsRequired
    case trialActive
    case trialExhausted
    case paidActive
    case friendOfRubyActive
    case paymentFailed
    case blocked
    case canceled
    case error
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "signed_out": self = .signedOut
        case "login_launching": self = .loginLaunching
        case "browser_pending": self = .browserPending
        case "handoff_pending": self = .handoffPending
        case "session_exchanging": self = .sessionExchanging
        case "account_refreshing": self = .accountRefreshing
        case "signed_in_terms_required": self = .signedInTermsRequired
        case "trial_active": self = .trialActive
        case "trial_exhausted": self = .trialExhausted
        case "paid_active": self = .paidActive
        case "friend_of_ruby_active": self = .friendOfRubyActive
        case "payment_failed": self = .paymentFailed
        case "blocked": self = .blocked
        case "canceled": self = .canceled
        case "error": self = .error
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .signedOut: return "signed_out"
        case .loginLaunching: return "login_launching"
        case .browserPending: return "browser_pending"
        case .handoffPending: return "handoff_pending"
        case .sessionExchanging: return "session_exchanging"
        case .accountRefreshing: return "account_refreshing"
        case .signedInTermsRequired: return "signed_in_terms_required"
        case .trialActive: return "trial_active"
        case .trialExhausted: return "trial_exhausted"
        case .paidActive: return "paid_active"
        case .friendOfRubyActive: return "friend_of_ruby_active"
        case .paymentFailed: return "payment_failed"
        case .blocked: return "blocked"
        case .canceled: return "canceled"
        case .error: return "error"
        case .unknown(let rawValue): return rawValue
        }
    }

    var description: String {
        rawValue
    }

    var canTranscribe: Bool {
        switch self {
        case .trialActive, .paidActive, .friendOfRubyActive:
            return true
        case .signedOut, .loginLaunching, .browserPending, .handoffPending,
             .sessionExchanging, .accountRefreshing, .signedInTermsRequired,
             .trialExhausted, .paymentFailed, .blocked, .canceled, .error,
             .unknown:
            return false
        }
    }

    var isLoginBridgePending: Bool {
        switch self {
        case .loginLaunching, .browserPending, .handoffPending, .sessionExchanging:
            return true
        case .signedOut, .accountRefreshing, .signedInTermsRequired, .trialActive,
             .trialExhausted, .paidActive, .friendOfRubyActive, .paymentFailed,
             .blocked, .canceled, .error, .unknown:
            return false
        }
    }

    static func accountState(for snapshot: RubyWhisperDesktopAccountSnapshot) -> DesktopAuthCoordinatorState {
        switch snapshot.state {
        case .signedOut:
            return snapshot.failureCode == .signedOut ? .signedOut : .error
        case .signedInTermsRequired:
            return .signedInTermsRequired
        case .trialActive:
            return .trialActive
        case .trialExhausted:
            return .trialExhausted
        case .paidActive:
            return .paidActive
        case .friendOfRubyActive:
            return .friendOfRubyActive
        case .paymentFailed:
            return .paymentFailed
        case .blocked:
            return .blocked
        case .durationLimitReached, .providerError, .networkError, .error:
            return .error
        case .unknown:
            return .error
        }
    }
}

enum DesktopAuthSessionClearReason: String, Equatable {
    case logout
    case missingSession
    case signedOutResponse
}

struct DesktopAuthSessionClearResult: Equatable, CustomStringConvertible {
    var reason: DesktopAuthSessionClearReason
    var keychainDeleteSucceeded: Bool
    var accountState: RubyWhisperDesktopState

    var description: String {
        "DesktopAuthSessionClearResult(reason: \(reason.rawValue), keychainDeleteSucceeded: \(keychainDeleteSucceeded), accountState: \(accountState.rawValue))"
    }
}

final class DesktopAuthStateOwner: ObservableObject, @unchecked Sendable {
    @Published private(set) var accountSnapshot: RubyWhisperDesktopAccountSnapshot
    @Published private(set) var coordinatorState: DesktopAuthCoordinatorState
    @Published private(set) var isRefreshingAccount = false
    @Published private(set) var lastClearResult: DesktopAuthSessionClearResult?

    private let sessionStore: DesktopSessionStoring
    private let accountSnapshotLoader: () async -> RubyWhisperDesktopAccountSnapshot
    private var refreshTask: Task<Void, Never>?
    private var sessionGeneration = 0

    init(
        sessionStore: DesktopSessionStoring = DesktopSessionKeychainStore(),
        initialSnapshot: RubyWhisperDesktopAccountSnapshot = .signedOut,
        accountSnapshotLoader: @escaping () async -> RubyWhisperDesktopAccountSnapshot
    ) {
        self.sessionStore = sessionStore
        let hasSession = sessionStore.read() != nil
        self.accountSnapshot = hasSession ? initialSnapshot : .signedOut
        if hasSession {
            self.coordinatorState = initialSnapshot.isSignedOutAuthFailure
                ? .accountRefreshing
                : DesktopAuthCoordinatorState.accountState(for: initialSnapshot)
        } else {
            self.coordinatorState = .signedOut
        }
        self.accountSnapshotLoader = accountSnapshotLoader
    }

    deinit {
        refreshTask?.cancel()
    }

    func refreshAccountSnapshot() async -> RubyWhisperDesktopAccountSnapshot {
        let generation = sessionGeneration

        guard sessionStore.read() != nil else {
            return clearSession(reason: .missingSession)
        }

        isRefreshingAccount = true
        coordinatorState = .accountRefreshing
        let snapshot = await accountSnapshotLoader()
        guard !Task.isCancelled, generation == sessionGeneration else {
            isRefreshingAccount = false
            return accountSnapshot
        }

        isRefreshingAccount = false
        if snapshot.isSignedOutAuthFailure {
            return clearSession(reason: .signedOutResponse)
        }

        accountSnapshot = snapshot
        coordinatorState = DesktopAuthCoordinatorState.accountState(for: snapshot)
        lastClearResult = nil
        return snapshot
    }

    func beginSignIn() {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        lastClearResult = nil
        accountSnapshot = .signedOut
        coordinatorState = .loginLaunching
    }

    func markBrowserPending() {
        coordinatorState = .browserPending
    }

    func markHandoffPending() {
        coordinatorState = .handoffPending
    }

    func markSessionExchanging() {
        coordinatorState = .sessionExchanging
    }

    func cancelSignIn() {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        accountSnapshot = .signedOut
        coordinatorState = .canceled
    }

    func refreshAccountSnapshotInBackground() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            _ = await self?.refreshAccountSnapshot()
        }
    }

    @discardableResult
    func logout() -> DesktopAuthSessionClearResult {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        _ = clearSession(reason: .logout)
        return lastClearResult ?? DesktopAuthSessionClearResult(
            reason: .logout,
            keychainDeleteSucceeded: false,
            accountState: .signedOut
        )
    }

    @discardableResult
    private func clearSession(reason: DesktopAuthSessionClearReason) -> RubyWhisperDesktopAccountSnapshot {
        let result = clearSessionResult(reason: reason)
        accountSnapshot = .signedOut
        coordinatorState = .signedOut
        isRefreshingAccount = false
        lastClearResult = result
        return accountSnapshot
    }

    private func clearSessionResult(reason: DesktopAuthSessionClearReason) -> DesktopAuthSessionClearResult {
        let deleteSucceeded: Bool
        do {
            try sessionStore.delete()
            deleteSucceeded = true
        } catch {
            deleteSucceeded = false
        }

        return DesktopAuthSessionClearResult(
            reason: reason,
            keychainDeleteSucceeded: deleteSucceeded,
            accountState: .signedOut
        )
    }
}

extension RubyWhisperDesktopAccountSnapshot {
    static var signedOut: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .signedOut,
            canTranscribe: false,
            recovery: .openSignIn,
            retryable: false,
            failureCode: .signedOut
        )
    }

    static var accountRefreshUnavailable: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .signedOut,
            canTranscribe: false,
            recovery: .retry,
            retryable: true,
            failureCode: .serviceUnavailable
        )
    }

    var isSignedOutAuthFailure: Bool {
        state == .signedOut && (failureCode == nil || failureCode == .signedOut)
    }
}
