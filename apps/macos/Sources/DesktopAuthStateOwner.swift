import Combine
import Foundation

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
        self.accountSnapshot = sessionStore.read() == nil ? .signedOut : initialSnapshot
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
        let snapshot = await accountSnapshotLoader()
        guard !Task.isCancelled, generation == sessionGeneration else {
            isRefreshingAccount = false
            return accountSnapshot
        }

        isRefreshingAccount = false
        if snapshot.state == .signedOut {
            return clearSession(reason: .signedOutResponse)
        }

        accountSnapshot = snapshot
        lastClearResult = nil
        return snapshot
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
}
