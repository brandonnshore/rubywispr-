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
    private(set) var deleteCount = 0

    init(session: DesktopSessionMaterial?) {
        self.session = session
    }

    func read() -> DesktopSessionMaterial? {
        session
    }

    func save(_ session: DesktopSessionMaterial) throws {
        self.session = session
    }

    func replace(with session: DesktopSessionMaterial) throws {
        self.session = session
    }

    func delete() throws {
        deleteCount += 1
        session = nil
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
        await testLogoutClearsSessionAndInMemoryAccountState()
        await testMissingSessionFailsClosedWithoutTransport()
        await testSignedOutRefreshClearsLocalSession()
        await testLoginBridgeShellStatesUseContractNames()
        await testAccountSnapshotsMapToCoordinatorStates()
        await testAccountRefreshFailureIsDistinctFromSignedOut()
        await testDiagnosticsDoNotExposeAuthMaterial()
        print("DesktopAuthStateOwnerTests passed")
    }

    private static func testLogoutClearsSessionAndInMemoryAccountState() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_logout"))
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
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

    private static func testLoginBridgeShellStatesUseContractNames() async {
        let store = MemorySessionStore(session: nil)
        let loader = AccountSnapshotLoader(nextSnapshot: activeSnapshot)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
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

    private static func testAccountRefreshFailureIsDistinctFromSignedOut() async {
        let store = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_refresh_failure"))
        let loader = AccountSnapshotLoader(nextSnapshot: .accountRefreshUnavailable)
        let owner = DesktopAuthStateOwner(
            sessionStore: store,
            initialSnapshot: activeSnapshot,
            accountSnapshotLoader: { await loader.load() }
        )

        let snapshot = await owner.refreshAccountSnapshot()

        expect(snapshot.state == .signedOut, "refresh failures should keep backend contract snapshot signed_out")
        expect(snapshot.failureCode == .serviceUnavailable, "refresh failure should carry backend failure code")
        expect(owner.coordinatorState == .error, "refresh failure should be distinct from signed_out coordinator state")
        expect(owner.lastClearResult == nil, "refresh failure should not be treated as logout/session clear")
        expect(store.read() != nil, "refresh failure should not delete local session material")
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
}
