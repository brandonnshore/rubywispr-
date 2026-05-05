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
        expect(store.read() == nil, "revoked session should delete durable session material")
        expect(owner.lastClearResult?.reason == .signedOutResponse, "revoked session should record signed_out clear reason")
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

    private static func sessionMaterial(token: String) -> DesktopSessionMaterial {
        DesktopSessionMaterial(
            accessToken: token,
            refreshToken: "refresh_placeholder_redacted",
            expiresAt: Date(timeIntervalSince1970: 4_102_444_800),
            accountID: "acct_test"
        )
    }
}
