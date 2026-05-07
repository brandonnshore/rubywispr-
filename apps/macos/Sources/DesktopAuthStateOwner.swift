import Combine
import Foundation

enum DesktopLoginBridgeOutcome: Equatable {
    case idle
    case launching
    case browserPending
    case callbackAccepted
    case alreadySignedIn
    case canceled
    case timedOut
    case launchFailed
    case exchangeFailed
    case invalidCallback(DesktopLoginBridgeFailureReason)

    var isFailure: Bool {
        switch self {
        case .timedOut, .launchFailed, .exchangeFailed, .invalidCallback:
            return true
        case .idle, .launching, .browserPending, .callbackAccepted, .alreadySignedIn, .canceled:
            return false
        }
    }

    var safeDescription: String {
        switch self {
        case .idle: return "idle"
        case .launching: return "launching"
        case .browserPending: return "browser_pending"
        case .callbackAccepted: return "callback_accepted"
        case .alreadySignedIn: return "already_signed_in"
        case .canceled: return "canceled"
        case .timedOut: return "timed_out"
        case .launchFailed: return "launch_failed"
        case .exchangeFailed: return "exchange_failed"
        case .invalidCallback(let reason): return reason.rawValue
        }
    }
}

enum DesktopLoginBridgeFailureReason: String, Equatable {
    case invalidRoute = "invalid_route"
    case missingState = "missing_state"
    case noPendingAttempt = "no_pending_attempt"
    case mismatchedState = "mismatched_state"
    case expiredState = "expired_state"
    case replayedState = "replayed_state"
    case missingExchangeCode = "missing_exchange_code"
    case canceledByBrowser = "canceled_by_browser"
}

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

enum DesktopDictationAccountGateDecision: Equatable, Hashable {
    case allowed
    case signInRequired
    case signInInProgress
    case accountRefreshing
    case termsRequired
    case trialExhausted
    case paymentFailed
    case blocked
    case accountUnavailable

    var allowsDictation: Bool {
        self == .allowed
    }

    var statusText: String {
        switch self {
        case .allowed:
            return "Ready"
        case .signInRequired:
            return "Sign in required"
        case .signInInProgress:
            return "Signing in"
        case .accountRefreshing:
            return "Loading account"
        case .termsRequired:
            return "Accept Terms"
        case .trialExhausted:
            return "Trial exhausted"
        case .paymentFailed:
            return "Payment failed"
        case .blocked:
            return "Account blocked"
        case .accountUnavailable:
            return "Account unavailable"
        }
    }

    var debugReason: String {
        switch self {
        case .allowed:
            return "allowed"
        case .signInRequired:
            return "sign_in_required"
        case .signInInProgress:
            return "sign_in_in_progress"
        case .accountRefreshing:
            return "account_refreshing"
        case .termsRequired:
            return "terms_required"
        case .trialExhausted:
            return "trial_exhausted"
        case .paymentFailed:
            return "payment_failed"
        case .blocked:
            return "account_blocked"
        case .accountUnavailable:
            return "account_unavailable"
        }
    }
}

extension DesktopAuthCoordinatorState {
    var dictationAccountGateDecision: DesktopDictationAccountGateDecision {
        switch self {
        case .trialActive, .paidActive, .friendOfRubyActive:
            return .allowed
        case .signedOut, .canceled:
            return .signInRequired
        case .loginLaunching, .browserPending, .handoffPending, .sessionExchanging:
            return .signInInProgress
        case .accountRefreshing:
            return .accountRefreshing
        case .signedInTermsRequired:
            return .termsRequired
        case .trialExhausted:
            return .trialExhausted
        case .paymentFailed:
            return .paymentFailed
        case .blocked:
            return .blocked
        case .error, .unknown:
            return .accountUnavailable
        }
    }

    var defaultRecoveryAction: RubyWhisperDesktopRecoveryAction {
        switch dictationAccountGateDecision {
        case .allowed:
            return .retry
        case .signInRequired:
            return .openSignIn
        case .signInInProgress, .accountRefreshing, .accountUnavailable:
            return .retry
        case .termsRequired:
            return .openTermsAcceptance
        case .trialExhausted:
            return .openCheckout
        case .paymentFailed:
            return .openBilling
        case .blocked:
            return .openAccount
        }
    }
}

enum DesktopAuthSessionClearReason: String, Equatable {
    case logout
    case missingSession
    case signedOutResponse
    case loginHandoffFailed
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
    private static let defaultAccountRefreshTimeout: TimeInterval = 15

    @Published private(set) var accountSnapshot: RubyWhisperDesktopAccountSnapshot
    @Published private(set) var coordinatorState: DesktopAuthCoordinatorState
    @Published private(set) var isRefreshingAccount = false
    @Published private(set) var lastClearResult: DesktopAuthSessionClearResult?
    @Published private(set) var lastLoginBridgeOutcome: DesktopLoginBridgeOutcome = .idle

    private let sessionStore: DesktopSessionStoring
    private let accountSnapshotLoader: () async -> RubyWhisperDesktopAccountSnapshot
    private let accountRefreshTimeoutNanoseconds: UInt64
    private var refreshTask: Task<Void, Never>?
    private var sessionGeneration = 0

    var authenticatedRequestGeneration: Int {
        sessionGeneration
    }

    init(
        sessionStore: DesktopSessionStoring = DesktopSessionKeychainStore(),
        initialSnapshot: RubyWhisperDesktopAccountSnapshot = .signedOut,
        accountRefreshTimeout: TimeInterval = DesktopAuthStateOwner.defaultAccountRefreshTimeout,
        accountSnapshotLoader: @escaping () async -> RubyWhisperDesktopAccountSnapshot
    ) {
        self.sessionStore = sessionStore
        self.accountRefreshTimeoutNanoseconds = Self.timeoutNanoseconds(for: accountRefreshTimeout)
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
        let snapshot = await loadAccountSnapshotWithTimeout()
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

    private func loadAccountSnapshotWithTimeout() async -> RubyWhisperDesktopAccountSnapshot {
        let loader = accountSnapshotLoader
        let timeout = accountRefreshTimeoutNanoseconds

        return await withTaskGroup(of: RubyWhisperDesktopAccountSnapshot.self) { group in
            group.addTask {
                await loader()
            }
            group.addTask {
                do {
                    try await Task.sleep(nanoseconds: timeout)
                } catch {
                    return .accountRefreshUnavailable
                }
                return .accountRefreshUnavailable
            }

            let snapshot = await group.next() ?? .accountRefreshUnavailable
            group.cancelAll()
            return snapshot
        }
    }

    private static func timeoutNanoseconds(for timeout: TimeInterval) -> UInt64 {
        let bounded = max(0.1, timeout)
        let nanoseconds = bounded * 1_000_000_000
        guard nanoseconds < Double(UInt64.max) else { return UInt64.max }
        return UInt64(nanoseconds)
    }

    func beginSignIn() {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        lastClearResult = nil
        lastLoginBridgeOutcome = .launching
        accountSnapshot = .signedOut
        coordinatorState = .loginLaunching
    }

    func markBrowserPending() {
        lastLoginBridgeOutcome = .browserPending
        coordinatorState = .browserPending
    }

    func markHandoffPending() {
        lastLoginBridgeOutcome = .callbackAccepted
        coordinatorState = .handoffPending
    }

    func markSessionExchanging() {
        coordinatorState = .sessionExchanging
    }

    func completeLoginHandoff(
        _ handoff: DesktopLoginHandoff,
        exchanger: DesktopLoginHandoffExchanging
    ) async -> RubyWhisperDesktopAccountSnapshot {
        let generation = sessionGeneration
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        markSessionExchanging()

        do {
            let session = try await exchanger.exchangeLoginHandoff(handoff)
            guard !Task.isCancelled, generation == sessionGeneration else {
                return accountSnapshot
            }
            try sessionStore.replace(with: session)
        } catch {
            guard !Task.isCancelled, generation == sessionGeneration else {
                return accountSnapshot
            }
            return failLoginHandoff(error)
        }

        guard !Task.isCancelled, generation == sessionGeneration else {
            return accountSnapshot
        }
        return await refreshAccountSnapshot()
    }

    func cancelSignIn() {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        lastLoginBridgeOutcome = .canceled
        accountSnapshot = .signedOut
        coordinatorState = .canceled
    }

    func markAlreadySignedIn() {
        lastLoginBridgeOutcome = .alreadySignedIn
    }

    func markSignInLaunchFailed() {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        lastLoginBridgeOutcome = .launchFailed
        accountSnapshot = .signedOut
        coordinatorState = .signedOut
    }

    func markSignInTimedOut() {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        lastLoginBridgeOutcome = .timedOut
        accountSnapshot = .signedOut
        coordinatorState = .signedOut
    }

    func rejectSignInCallback(reason: DesktopLoginBridgeFailureReason) {
        sessionGeneration += 1
        refreshTask?.cancel()
        refreshTask = nil
        isRefreshingAccount = false
        lastLoginBridgeOutcome = .invalidCallback(reason)
        accountSnapshot = .signedOut
        coordinatorState = .signedOut
    }

    func refreshAccountSnapshotInBackground() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            _ = await self?.refreshAccountSnapshot()
        }
    }

    func applyTranscriptionUsageMetadata(
        _ metadata: RubyWhisperDesktopTranscriptionUsageMetadata
    ) {
        var snapshot = accountSnapshot
        snapshot.trialWordsRemaining = metadata.trialWordsRemaining ?? snapshot.trialWordsRemaining
        snapshot.trialWordsUsed = metadata.trialWordsUsed ?? snapshot.trialWordsUsed
        snapshot.trialWordsLimit = metadata.trialWordsLimit ?? snapshot.trialWordsLimit
        snapshot.planState = metadata.planState ?? snapshot.planState

        if let planState = metadata.planState {
            switch planState {
            case .trialActive, .paidActive, .friendOfRubyActive:
                snapshot.state = RubyWhisperDesktopState(rawValue: planState.rawValue)
                snapshot.canTranscribe = true
                snapshot.recovery = nil
                snapshot.retryable = false
                snapshot.failureCode = nil
            case .trialExhausted:
                snapshot.state = .trialExhausted
                snapshot.canTranscribe = false
                snapshot.recovery = .openCheckout
                snapshot.retryable = false
                snapshot.failureCode = .trialExhausted
            case .paymentFailed:
                snapshot.state = .paymentFailed
                snapshot.canTranscribe = false
                snapshot.recovery = .openBilling
                snapshot.retryable = false
                snapshot.failureCode = .paymentFailed
            case .blocked:
                snapshot.state = .blocked
                snapshot.canTranscribe = false
                snapshot.recovery = .openAccount
                snapshot.retryable = false
                snapshot.failureCode = .accountBlocked
            case .unknown:
                break
            }
        }

        if let remaining = metadata.trialWordsRemaining {
            snapshot.isTrialExhausted = remaining <= 0
        }

        accountSnapshot = snapshot
        coordinatorState = DesktopAuthCoordinatorState.accountState(for: snapshot)
    }

    @discardableResult
    func applyTranscriptionBackendError(
        _ error: RubyWhisperBackendError
    ) -> RubyWhisperDesktopAccountSnapshot {
        if error.code == .signedOut {
            return clearSession(reason: .signedOutResponse)
        }

        let snapshot = RubyWhisperDesktopAccountSnapshot(error: error)
        switch snapshot.state {
        case .signedInTermsRequired, .trialExhausted, .paymentFailed, .blocked:
            accountSnapshot = snapshot
            coordinatorState = DesktopAuthCoordinatorState.accountState(for: snapshot)
            lastClearResult = nil
        case .signedOut, .trialActive, .paidActive, .friendOfRubyActive,
             .durationLimitReached, .providerError, .networkError, .error, .unknown:
            break
        }
        return snapshot
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
        lastLoginBridgeOutcome = .idle
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

    private func failLoginHandoff(_ error: Error) -> RubyWhisperDesktopAccountSnapshot {
        let result = clearSessionResult(reason: .loginHandoffFailed)
        let snapshot: RubyWhisperDesktopAccountSnapshot

        if let clientError = error as? RubyWhisperBackendClientError,
           case .backend(let backendError) = clientError {
            snapshot = RubyWhisperDesktopAccountSnapshot(error: backendError)
        } else {
            snapshot = .accountRefreshUnavailable
        }

        accountSnapshot = snapshot
        coordinatorState = DesktopAuthCoordinatorState.accountState(for: snapshot)
        isRefreshingAccount = false
        lastClearResult = result
        lastLoginBridgeOutcome = .exchangeFailed
        return snapshot
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
            state: .error,
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
