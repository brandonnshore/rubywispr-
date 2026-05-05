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

    init(session: DesktopSessionMaterial? = nil) {
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
        session = nil
    }
}

@main
private struct DesktopLoginBridgeTests {
    static func main() async {
        testLaunchOpensApprovedSignInRouteWithSafeMetadata()
        testValidCallbackIsAcceptedOnce()
        testCallbackRejectsMissingMismatchedAndStaleState()
        testCancelAndTimeoutAreRecoverable()
        testAlreadySignedInDoesNotOpenBrowser()
        print("DesktopLoginBridgeTests passed")
    }

    private static func testLaunchOpensApprovedSignInRouteWithSafeMetadata() {
        let fixture = LoginBridgeFixture()
        let result = fixture.bridge.startLogin()

        expect(result.outcome == .browserPending, "launch should move to browser_pending")
        expect(fixture.owner.coordinatorState == .browserPending, "owner should publish browser_pending")
        expect(fixture.openedURLs.count == 1, "launch should open exactly one browser URL")

        let openedURL = fixture.openedURLs[0]
        let components = URLComponents(url: openedURL, resolvingAgainstBaseURL: false)
        let query = queryItems(openedURL)

        expect(openedURL.scheme == "https", "login URL should use the configured HTTPS base")
        expect(openedURL.host == "app.example.test", "login URL should use the configured host")
        expect(components?.path == "/sign-in", "login URL should target the approved sign-in route")
        expect(query["desktop"] == "1", "login URL should declare desktop flow")
        expect(query["handoff"] == "callback", "login URL should request callback handoff")
        expect(query["callback_scheme"] == "rubywhisper", "login URL should declare callback scheme")
        expect(query["state"]?.isEmpty == false, "login URL should include opaque state")
        expect(query["nonce_challenge"]?.isEmpty == false, "login URL should include nonce challenge")
        expect(query["nonce_method"] == "S256", "login URL should identify nonce challenge method")
        expect(query["code"] == nil, "login URL must not include an exchange code")
        expect(query["token"] == nil, "login URL must not include token-shaped query keys")
    }

    private static func testValidCallbackIsAcceptedOnce() {
        let fixture = LoginBridgeFixture()
        _ = fixture.bridge.startLogin()
        let state = launchedState(fixture)

        let callbackURL = URL(string: "rubywhisper://auth/callback?state=\(state)&code=exchange_placeholder")!
        let accepted = fixture.bridge.handleCallbackURL(callbackURL)

        expect(accepted.outcome == .callbackAccepted, "valid callback should be accepted")
        expect(fixture.owner.coordinatorState == .handoffPending, "accepted callback should enter handoff_pending")
        expect(!fixture.bridge.hasPendingAttempt, "accepted callback should consume pending attempt")

        let replayed = fixture.bridge.handleCallbackURL(callbackURL)
        expect(replayed.outcome == .invalidCallback(.replayedState), "same state should be rejected as replayed")
        expect(fixture.owner.lastLoginBridgeOutcome == .invalidCallback(.replayedState), "replay should publish safe replay outcome")
    }

    private static func testCallbackRejectsMissingMismatchedAndStaleState() {
        let missing = LoginBridgeFixture()
        _ = missing.bridge.startLogin()
        let missingResult = missing.bridge.handleCallbackURL(
            URL(string: "rubywhisper://auth/callback?code=exchange_placeholder")!
        )
        expect(missingResult.outcome == .invalidCallback(.missingState), "callback without state should be rejected")
        expect(missing.owner.coordinatorState == .signedOut, "missing state should return to signed_out")

        let mismatch = LoginBridgeFixture()
        _ = mismatch.bridge.startLogin()
        let mismatchResult = mismatch.bridge.handleCallbackURL(
            URL(string: "rubywhisper://auth/callback?state=other_state&code=exchange_placeholder")!
        )
        expect(mismatchResult.outcome == .invalidCallback(.mismatchedState), "mismatched state should be rejected")
        expect(mismatch.owner.lastLoginBridgeOutcome == .invalidCallback(.mismatchedState), "mismatch should publish safe outcome")

        let stale = LoginBridgeFixture()
        _ = stale.bridge.startLogin()
        let state = launchedState(stale)
        stale.now = Date(timeIntervalSince1970: 10_000)
        let staleResult = stale.bridge.handleCallbackURL(
            URL(string: "rubywhisper://auth/callback?state=\(state)&code=exchange_placeholder")!
        )
        expect(staleResult.outcome == .timedOut, "expired callback should time out")
        expect(stale.owner.coordinatorState == .signedOut, "expired callback should return to signed_out")
    }

    private static func testCancelAndTimeoutAreRecoverable() {
        let canceled = LoginBridgeFixture()
        _ = canceled.bridge.startLogin()
        let cancelOutcome = canceled.bridge.cancelPendingAttempt()
        expect(cancelOutcome == .canceled, "cancel should publish canceled outcome")
        expect(canceled.owner.coordinatorState == .canceled, "cancel should leave recoverable canceled state")
        expect(!canceled.bridge.hasPendingAttempt, "cancel should clear pending attempt")

        let timeout = LoginBridgeFixture()
        _ = timeout.bridge.startLogin()
        timeout.now = Date(timeIntervalSince1970: 10_000)
        let timeoutOutcome = timeout.bridge.expirePendingAttemptIfNeeded()
        expect(timeoutOutcome == .timedOut, "timeout should be reported")
        expect(timeout.owner.coordinatorState == .signedOut, "timeout should return to signed_out")
        expect(timeout.owner.lastLoginBridgeOutcome == .timedOut, "timeout should publish safe outcome")
    }

    private static func testAlreadySignedInDoesNotOpenBrowser() {
        let fixture = LoginBridgeFixture(
            initialSession: DesktopSessionMaterial(
                accessToken: "session_placeholder_redacted",
                refreshToken: nil,
                expiresAt: Date(timeIntervalSince1970: 4_102_444_800),
                accountID: "acct_test"
            ),
            initialSnapshot: activeSnapshot
        )

        let result = fixture.bridge.startLogin()

        expect(result.outcome == .alreadySignedIn, "already signed-in user should not start a new login attempt")
        expect(fixture.openedURLs.isEmpty, "already signed-in user should not open browser")
        expect(fixture.owner.coordinatorState == .trialActive, "already signed-in state should be preserved")
    }

    private static func launchedState(_ fixture: LoginBridgeFixture) -> String {
        guard let state = queryItems(fixture.openedURLs[0])["state"], !state.isEmpty else {
            FileHandle.standardError.write(Data("FAIL: launched URL missing state\n".utf8))
            exit(1)
        }
        return state
    }

    private static func queryItems(_ url: URL) -> [String: String] {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return [:]
        }
        var result: [String: String] = [:]
        for item in components.queryItems ?? [] {
            result[item.name] = item.value
        }
        return result
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
}

private final class LoginBridgeFixture {
    let owner: DesktopAuthStateOwner
    let bridge: DesktopLoginBridge
    private let urlRecorder = URLRecorder()
    private let clock = MutableClock(now: Date(timeIntervalSince1970: 1_000))
    var openedURLs: [URL] { urlRecorder.openedURLs }
    var now: Date {
        get { clock.now }
        set { clock.now = newValue }
    }

    init(
        initialSession: DesktopSessionMaterial? = nil,
        initialSnapshot: RubyWhisperDesktopAccountSnapshot = .signedOut
    ) {
        let sessionStore = MemorySessionStore(session: initialSession)
        owner = DesktopAuthStateOwner(
            sessionStore: sessionStore,
            initialSnapshot: initialSnapshot,
            accountSnapshotLoader: { .signedOut }
        )
        bridge = DesktopLoginBridge(
            configurationLoader: {
                try DesktopLoginBridgeConfiguration(
                    signInURL: URL(string: "https://app.example.test/sign-in")!,
                    appVersion: "0.1.0-test",
                    appChannel: "test",
                    attemptTTL: 300
                )
            },
            stateOwner: owner,
            browserOpener: { [urlRecorder] url in
                urlRecorder.openedURLs.append(url)
                return true
            },
            now: { [clock] in clock.now },
            uuid: { UUID(uuidString: "00000000-0000-0000-0000-000000000061")! }
        )
    }
}

private final class URLRecorder {
    var openedURLs: [URL] = []
}

private final class MutableClock {
    var now: Date

    init(now: Date) {
        self.now = now
    }
}
