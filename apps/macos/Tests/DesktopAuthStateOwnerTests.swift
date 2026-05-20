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

private final class MemorySessionStore: DesktopSessionStoring {
    private var session: DesktopSessionMaterial?
    private(set) var readCount = 0
    private(set) var deleteCount = 0
    private(set) var replaceCount = 0

    init(session: DesktopSessionMaterial?) {
        self.session = session
    }

    func read() -> DesktopSessionMaterial? {
        readCount += 1
        return session
    }

    func save(_ session: DesktopSessionMaterial) throws {
        self.session = session
    }

    func replace(with session: DesktopSessionMaterial) throws {
        replaceCount += 1
        self.session = session
    }

    func delete() throws {
        deleteCount += 1
        session = nil
    }
}

private final class HandoffExchanger: DesktopLoginHandoffExchanging {
    enum Result {
        case success(DesktopSessionMaterial)
        case failure(Error)
    }

    private(set) var handoffs: [DesktopLoginHandoff] = []
    var result: Result

    init(result: Result) {
        self.result = result
    }

    func exchangeLoginHandoff(_ handoff: DesktopLoginHandoff) async throws -> DesktopSessionMaterial {
        handoffs.append(handoff)
        switch result {
        case .success(let session):
            return session
        case .failure(let error):
            throw error
        }
    }
}

private final class AccountSnapshotLoader {
    private(set) var callCount = 0
    var nextSnapshot: RubyWhisperDesktopAccountSnapshot

    init(nextSnapshot: RubyWhisperDesktopAccountSnapshot) {
        self.nextSnapshot = nextSnapshot
    }

    func load() async -> RubyWhisperDesktopAccountSnapshot {
        callCount += 1
        return nextSnapshot
    }
}

@main
private struct DesktopAuthStateOwnerTests {
    static func main() async {
        await testInitializationDoesNotReadDurableSessionStore()
        await testLogoutClearsSessionAndInMemoryAccountState()
        await testMissingSessionFailsClosedWithoutTransport()
        await testSignedOutRefreshClearsLocalSession()
        await testLoginHandoffStoresSessionThenRefreshesAccount()
        await testLoginHandoffFailureClearsSessionAndUsesStableState()
        await testLoginBridgeShellStatesUseContractNames()
        await testAccountSnapshotsMapToCoordinatorStates()
        await testDictationAccountGateKeepsRecoveryStatesDistinct()
        await testAccountRefreshFailureIsDistinctFromSignedOut()
        await testTranscriptionUsageAndErrorsUpdateAccountState()
        await testDiagnosticsDoNotExposeAuthMaterial()
        print("DesktopAuthStateOwnerTests passed")
    }

    private static func testInitializationDoesNotReadDurableSessionStore() async {
        let store = MemorySessionStore(session: nil)
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            accountSnapshotLoader: { await loader.load() }
        )

        expect(store.readCount == 0, "initialization must not synchronously read durable session material")
        expect(owner.coordinatorState == .accountRefreshing, "unknown durable session state should publish account_refreshing")

        let snapshot = await owner.refreshAccountSnapshot()

        expect(store.readCount == 1, "explicit refresh should read durable session material")
        expect(snapshot.state == .signedOut, "missing session should still fail closed after refresh")
        expect(loader.callCount == 0, "missing session refresh should not call account transport")
    }

    private static func testLogoutClearsSessionAndInMemoryAccountState() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_logout"))
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialStoredSessionState: .present,
            accountSnapshotLoader: { await loader.load() }
        )

        expect(owner.coordinatorState == .accountRefreshing, "existing session without account snapshot should publish account_refreshing")

        let active = await owner.refreshAccountSnapshot()
        expect(active.state == .trialActive, "refresh should populate active account state")
        expect(active.canTranscribe, "active account state should allow dictation")
        expect(store.read() != nil, "active refresh should keep session material")

        let result = owner.logout()

        expect(store.read() == nil, "logout should delete durable session material")
        expect(store.deleteCount == 1, "logout should issue one session delete")
        expect(owner.accountSnapshot.state == .signedOut, "logout should clear in-memory account state")
        expect(owner.accountSnapshot.canTranscribe == false, "logout should disable dictation")
        expect(owner.accountSnapshot.recovery == .openSignIn, "logout should recover through sign-in")
        expect(result.reason == .logout, "logout result should record logout reason")
        expect(result.keychainDeleteSucceeded, "logout result should record successful Keychain clearing")
    }

    private static func testMissingSessionFailsClosedWithoutTransport() async {
        let store = MemorySessionStore(session: nil)
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialStoredSessionState: .missing,
            accountSnapshotLoader: { await loader.load() }
        )

        let snapshot = await owner.refreshAccountSnapshot()

        expect(snapshot.state == .signedOut, "missing session should fail closed to signed_out")
        expect(snapshot.canTranscribe == false, "missing session should disable dictation")
        expect(loader.callCount == 0, "missing session should not call account transport")
        expect(store.deleteCount == 1, "missing session should clear any stale local item")
        expect(owner.lastClearResult?.reason == .missingSession, "missing session should record clear reason only")
    }

    private static func testSignedOutRefreshClearsLocalSession() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_revoked"))
        let loader = AccountSnapshotLoader(nextSnapshot: .signedOut)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialSnapshot: activeSnapshot,
            accountSnapshotLoader: { await loader.load() }
        )

        let snapshot = await owner.refreshAccountSnapshot()

        expect(loader.callCount == 1, "existing session should refresh account once")
        expect(snapshot.state == .signedOut, "revoked session should fail closed to signed_out")
        expect(snapshot.canTranscribe == false, "revoked session should disable dictation")
        expect(owner.coordinatorState == .signedOut, "revoked session should publish signed_out coordinator state")
        expect(store.read() == nil, "revoked session should delete durable session material")
        expect(owner.lastClearResult?.reason == .signedOutResponse, "revoked session should record signed_out clear reason")
    }

    private static func testLoginHandoffStoresSessionThenRefreshesAccount() async {
        let exchangedSession = sessionMaterial(token: "session_placeholder_redacted_exchanged")
        let store = MemorySessionStore(session: nil)
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let exchanger = HandoffExchanger(result: .success(exchangedSession))
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            accountSnapshotLoader: { await loader.load() }
        )

        owner.beginSignIn()
        owner.markHandoffPending()
        let snapshot = await owner.completeLoginHandoff(syntheticHandoff, exchanger: exchanger)

        expect(exchanger.handoffs.count == 1, "login handoff should be exchanged once")
        expect(store.replaceCount == 1, "exchanged session should be written through session store replace")
        expect(store.read() == exchangedSession, "session store should hold exchanged session material")
        expect(loader.callCount == 1, "successful session exchange should immediately refresh account")
        expect(snapshot.state == .trialActive, "successful handoff should return refreshed account snapshot")
        expect(owner.coordinatorState == .trialActive, "successful handoff should publish account state")
    }

    private static func testLoginHandoffFailureClearsSessionAndUsesStableState() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_stale"))
        let exchanger = HandoffExchanger(result: .failure(RubyWhisperBackendClientError.backend(
            RubyWhisperBackendError(
                code: .serviceUnavailable,
                message: "RubyWhisper login is temporarily unavailable.",
                recovery: .retry,
                desktopState: .signedOut,
                retryable: true
            )
        )))
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            accountSnapshotLoader: { await loader.load() }
        )

        owner.beginSignIn()
        owner.markHandoffPending()
        let snapshot = await owner.completeLoginHandoff(syntheticHandoff, exchanger: exchanger)

        expect(snapshot.state == .error, "handoff exchange service errors should map stable error state")
        expect(snapshot.failureCode == .serviceUnavailable, "handoff exchange failure should keep stable backend failure code")
        expect(snapshot.recovery == .retry, "handoff exchange failure should preserve stable recovery")
        expect(owner.coordinatorState == .error, "retryable handoff failure should publish recoverable error state")
        expect(owner.lastLoginBridgeOutcome == .exchangeFailed, "handoff failure should publish safe exchange failure outcome")
        expect(owner.lastClearResult?.reason == .loginHandoffFailed, "handoff failure should record clear reason")
        expect(store.read() == nil, "handoff failure should clear stale durable session material")
        expect(loader.callCount == 0, "failed handoff should not refresh account")
    }

    private static func testLoginBridgeShellStatesUseContractNames() async {
        let store = MemorySessionStore(session: nil)
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialStoredSessionState: .missing,
            accountSnapshotLoader: { await loader.load() }
        )

        expect(owner.coordinatorState == .signedOut, "initial missing-session coordinator state should be signed_out")

        owner.beginSignIn()
        expect(owner.coordinatorState == .loginLaunching, "begin sign-in should enter login_launching")
        expect(owner.coordinatorState.rawValue == "login_launching", "login launching should use login bridge raw value")
        expect(owner.coordinatorState.isLoginBridgePending, "login_launching should be a pending login bridge state")
        expect(owner.coordinatorState.canTranscribe == false, "login_launching should disable dictation")

        owner.markBrowserPending()
        expect(owner.coordinatorState.rawValue == "browser_pending", "browser pending should use login bridge raw value")

        owner.markHandoffPending()
        expect(owner.coordinatorState.rawValue == "handoff_pending", "handoff pending should use login bridge raw value")

        owner.markSessionExchanging()
        expect(owner.coordinatorState.rawValue == "session_exchanging", "session exchanging should use login bridge raw value")

        owner.cancelSignIn()
        expect(owner.coordinatorState == .canceled, "cancel should publish canceled coordinator state")
        expect(owner.accountSnapshot.state == .signedOut, "cancel should keep account snapshot signed_out")
        expect(owner.coordinatorState.canTranscribe == false, "canceled should disable dictation")
    }

    private static func testAccountSnapshotsMapToCoordinatorStates() async {
        let cases: [(name: String, snapshot: RubyWhisperDesktopAccountSnapshot, state: DesktopAuthCoordinatorState)] = [
            ("terms required", termsRequiredSnapshot, .signedInTermsRequired),
            ("trial active", activeSnapshot, .trialActive),
            ("trial exhausted", trialExhaustedSnapshot, .trialExhausted),
            ("paid active", paidActiveSnapshot, .paidActive),
            ("blocked", blockedSnapshot, .blocked),
            ("payment failed", paymentFailedSnapshot, .paymentFailed),
        ]

        for testCase in cases {
            let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_\(testCase.name)"))
            let loader = AccountSnapshotLoader(nextSnapshot: testCase.snapshot)
            let owner = DesktopAuthStateOwner(
                sessionStore: store,
                accountSnapshotLoader: { await loader.load() }
            )

            let snapshot = await owner.refreshAccountSnapshot()

            expect(snapshot.state == testCase.snapshot.state, "\(testCase.name) should refresh snapshot")
            expect(owner.coordinatorState == testCase.state, "\(testCase.name) should publish coordinator state")
            expect(owner.coordinatorState.rawValue == testCase.state.rawValue, "\(testCase.name) should keep stable raw state")
            expect(owner.coordinatorState.canTranscribe == testCase.snapshot.canTranscribe, "\(testCase.name) should mirror dictation eligibility")
        }
    }

    private static func testDictationAccountGateKeepsRecoveryStatesDistinct() async {
        let cases: [(state: DesktopAuthCoordinatorState, decision: DesktopDictationAccountGateDecision)] = [
            (.signedOut, .signInRequired),
            (.canceled, .signInRequired),
            (.loginLaunching, .signInInProgress),
            (.browserPending, .signInInProgress),
            (.handoffPending, .signInInProgress),
            (.sessionExchanging, .signInInProgress),
            (.accountRefreshing, .accountRefreshing),
            (.signedInTermsRequired, .termsRequired),
            (.trialActive, .allowed),
            (.paidActive, .allowed),
            (.friendOfRubyActive, .allowed),
            (.trialExhausted, .trialExhausted),
            (.paymentFailed, .paymentFailed),
            (.blocked, .blocked),
            (.error, .accountUnavailable),
            (.unknown("future_account_state"), .accountUnavailable),
        ]

        for testCase in cases {
            let decision = testCase.state.dictationAccountGateDecision
            expect(decision == testCase.decision, "\(testCase.state.rawValue) should map to \(testCase.decision.debugReason)")
            expect(
                decision.allowsDictation == testCase.state.canTranscribe,
                "\(testCase.state.rawValue) dictation gate should mirror coordinator transcription eligibility"
            )
        }

        let distinctBlockedStates: [DesktopAuthCoordinatorState] = [
            .signedInTermsRequired,
            .trialExhausted,
            .paymentFailed,
            .blocked,
        ]
        let decisions = Set(distinctBlockedStates.map(\.dictationAccountGateDecision))
        expect(decisions.count == distinctBlockedStates.count, "terms, trial, payment, and blocked states must remain distinct")
        expect(!decisions.contains(.signInRequired), "signed-in recovery states must not collapse to sign-in")
    }

    private static func testAccountRefreshFailureIsDistinctFromSignedOut() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_refresh_failure"))
        let loader = AccountSnapshotLoader(nextSnapshot: .accountRefreshUnavailable)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialSnapshot: activeSnapshot,
            accountSnapshotLoader: { await loader.load() }
        )

        let snapshot = await owner.refreshAccountSnapshot()

        expect(snapshot.state == .error, "refresh failures should keep backend contract snapshot in error")
        expect(snapshot.failureCode == .serviceUnavailable, "refresh failure should carry backend failure code")
        expect(owner.coordinatorState == .error, "refresh failure should be distinct from signed_out coordinator state")
        expect(owner.lastClearResult == nil, "refresh failure should not be treated as logout/session clear")
        expect(store.read() != nil, "refresh failure should not delete local session material")
    }

    private static func testTranscriptionUsageAndErrorsUpdateAccountState() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_upload_state"))
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialSnapshot: activeSnapshot,
            accountSnapshotLoader: { await loader.load() }
        )

        owner.applyTranscriptionUsageMetadata(RubyWhisperDesktopTranscriptionUsageMetadata(
            cleanedWordCount: 4,
            trialWordsRemaining: 0,
            trialWordsUsed: 5000,
            trialWordsLimit: 5000,
            planState: .trialExhausted,
            audioDurationMs: 1200
        ))

        expect(owner.accountSnapshot.state == .trialExhausted, "upload usage metadata should update exhausted plan state")
        expect(owner.accountSnapshot.canTranscribe == false, "exhausted upload metadata should disable future dictation")
        expect(owner.accountSnapshot.recovery == .openCheckout, "exhausted upload metadata should route checkout recovery")
        expect(owner.coordinatorState == .trialExhausted, "upload usage metadata should update coordinator state")
        expect(store.read() != nil, "usage metadata updates should not clear session")

        _ = owner.applyTranscriptionBackendError(RubyWhisperBackendError(
            code: .paymentFailed,
            httpStatus: 402,
            message: "Update billing to continue.",
            recovery: .openBilling,
            desktopState: .paymentFailed,
            retryable: false
        ))

        expect(owner.accountSnapshot.state == .paymentFailed, "upload billing error should update account state")
        expect(owner.coordinatorState == .paymentFailed, "upload billing error should update coordinator state")
        expect(store.read() != nil, "billing errors should not clear session")

        _ = owner.applyTranscriptionBackendError(RubyWhisperBackendError(
            code: .signedOut,
            httpStatus: 401,
            message: "Sign in to use RubyWhisper.",
            recovery: .openSignIn,
            desktopState: .signedOut,
            retryable: false
        ))

        expect(owner.accountSnapshot.state == .signedOut, "upload signed_out should clear account state")
        expect(owner.coordinatorState == .signedOut, "upload signed_out should publish signed_out")
        expect(store.read() == nil, "upload signed_out should clear durable session material")
    }

    private static func testDiagnosticsDoNotExposeAuthMaterial() async {
        let token = "session_placeholder_redacted_diagnostic"
        let store = MemorySessionStore(session: sessionMaterial(token: token))
        let loader = AccountSnapshotLoader(nextSnapshot: .signedOut)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialSnapshot: activeSnapshot,
            accountSnapshotLoader: { await loader.load() }
        )

        _ = await owner.refreshAccountSnapshot()
        let diagnostic = String(describing: owner.lastClearResult!)

        expect(!diagnostic.contains(token), "clear diagnostics should not contain session tokens")
        expect(!diagnostic.contains("Authorization"), "clear diagnostics should not contain auth header names")
        expect(!diagnostic.contains("Bearer"), "clear diagnostics should not contain bearer values")
    }

    private static var activeSnapshot: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .trialActive,
            canTranscribe: true,
            retryable: false,
            email: "user@example.test",
            termsAccepted: true,
            accountStatus: .active,
            planState: .trialActive,
            billingPortalAvailable: false
        )
    }

    private static var termsRequiredSnapshot: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .signedInTermsRequired,
            canTranscribe: false,
            recovery: .openTermsAcceptance,
            retryable: false,
            email: "user@example.test",
            termsAccepted: false,
            accountStatus: .termsRequired,
            planState: .trialActive,
            billingPortalAvailable: false,
            failureCode: .termsRequired
        )
    }

    private static var trialExhaustedSnapshot: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .trialExhausted,
            canTranscribe: false,
            recovery: .openCheckout,
            retryable: false,
            email: "user@example.test",
            termsAccepted: true,
            accountStatus: .active,
            planState: .trialExhausted,
            billingPortalAvailable: false,
            failureCode: .trialExhausted
        )
    }

    private static var paidActiveSnapshot: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .paidActive,
            canTranscribe: true,
            retryable: false,
            email: "user@example.test",
            termsAccepted: true,
            accountStatus: .active,
            planState: .paidActive,
            billingPortalAvailable: true
        )
    }

    private static var blockedSnapshot: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .blocked,
            canTranscribe: false,
            recovery: .openAccount,
            retryable: false,
            email: "user@example.test",
            termsAccepted: true,
            accountStatus: .active,
            planState: .blocked,
            billingPortalAvailable: false,
            failureCode: .accountBlocked
        )
    }

    private static var paymentFailedSnapshot: RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: .paymentFailed,
            canTranscribe: false,
            recovery: .openBilling,
            retryable: false,
            email: "user@example.test",
            termsAccepted: true,
            accountStatus: .active,
            planState: .paymentFailed,
            billingPortalAvailable: true,
            failureCode: .paymentFailed
        )
    }

    private static func sessionMaterial(token: String) -> DesktopSessionMaterial {
        DesktopSessionMaterial(
            accessToken: token,
            refreshToken: "refresh_placeholder_redacted",
            expiresAt: Date(timeIntervalSince1970: 4_102_444_800),
            accountID: "acct_test"
        )
    }

    private static var syntheticHandoff: DesktopLoginHandoff {
        DesktopLoginHandoff(
            attemptID: UUID(uuidString: "00000000-0000-0000-0000-000000000061")!,
            state: "state_placeholder_redacted",
            exchangeCode: "exchange_placeholder_redacted",
            nonceVerifier: "nonce_placeholder_redacted"
        )
    }
}
