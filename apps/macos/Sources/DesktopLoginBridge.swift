import AppKit
import CryptoKit
import Foundation
import Security

struct DesktopLoginBridgeConfiguration: Equatable {
    static let defaultLoginPath = "/sign-in"
    static let callbackScheme = "rubywhisper"
    static let callbackHost = "auth"
    static let callbackPath = "/callback"

    var signInURL: URL
    var appVersion: String
    var appChannel: String?
    var platform: String
    var callbackScheme: String
    var attemptTTL: TimeInterval

    init(
        signInURL: URL,
        appVersion: String,
        appChannel: String? = nil,
        platform: String = "macos",
        callbackScheme: String = Self.callbackScheme,
        attemptTTL: TimeInterval = 90
    ) throws {
        guard attemptTTL > 0 else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login attempt TTL must be positive.")
        }

        self.signInURL = try Self.normalizedHTTPSignInURL(signInURL)
        self.appVersion = appVersion
        self.appChannel = appChannel?.nilIfBlank
        self.platform = platform
        self.callbackScheme = callbackScheme
        self.attemptTTL = attemptTTL
    }

    static func load(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> DesktopLoginBridgeConfiguration {
        let backendConfiguration = try RubyWhisperBackendConfiguration.load(
            bundle: bundle,
            environment: environment
        )
        return try DesktopLoginBridgeConfiguration(
            signInURL: signInURL(baseURL: backendConfiguration.baseURL),
            appVersion: backendConfiguration.appVersion,
            appChannel: backendConfiguration.appChannel,
            platform: backendConfiguration.platform
        )
    }

    private static func signInURL(baseURL: URL) throws -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login base URL is malformed.")
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let loginPath = defaultLoginPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + [basePath, loginPath].filter { !$0.isEmpty }.joined(separator: "/")
        components.query = nil
        components.fragment = nil

        guard let url = components.url else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login URL is malformed.")
        }
        return url
    }

    private static func normalizedHTTPSignInURL(_ url: URL) throws -> URL {
        guard let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login URL must use http or https.")
        }

        guard url.host?.nilIfBlank != nil else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login URL must include a host.")
        }

        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.fragment = nil
        guard let normalized = components?.url else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login URL is malformed.")
        }
        return normalized
    }
}

struct DesktopLoginAttempt: Equatable {
    var id: UUID
    var state: String
    var nonceVerifier: String
    var nonceChallenge: String
    var expiresAt: Date
}

struct DesktopLoginLaunchResult: Equatable {
    var outcome: DesktopLoginBridgeOutcome
    var loginURL: URL?
    var expiresAt: Date?
}

struct DesktopLoginCallbackResult: Equatable {
    var outcome: DesktopLoginBridgeOutcome
    var handoff: DesktopLoginHandoff?
}

final class DesktopLoginBridge {
    typealias BrowserOpener = (URL) -> Bool

    private let configurationLoader: () throws -> DesktopLoginBridgeConfiguration
    private let stateOwner: DesktopAuthStateOwner
    private let handoffExchanger: DesktopLoginHandoffExchanging
    private let browserOpener: BrowserOpener
    private let now: () -> Date
    private let uuid: () -> UUID
    private var pendingAttempt: DesktopLoginAttempt?
    private var consumedStates: [String] = []

    init(
        configurationLoader: @escaping () throws -> DesktopLoginBridgeConfiguration = { try DesktopLoginBridgeConfiguration.load() },
        stateOwner: DesktopAuthStateOwner,
        handoffExchanger: DesktopLoginHandoffExchanging = DesktopLoginHandoffUnavailableExchanger(),
        browserOpener: @escaping BrowserOpener = { NSWorkspace.shared.open($0) },
        now: @escaping () -> Date = Date.init,
        uuid: @escaping () -> UUID = UUID.init
    ) {
        self.configurationLoader = configurationLoader
        self.stateOwner = stateOwner
        self.handoffExchanger = handoffExchanger
        self.browserOpener = browserOpener
        self.now = now
        self.uuid = uuid
    }

    var pendingAttemptExpiresAt: Date? {
        pendingAttempt?.expiresAt
    }

    var hasPendingAttempt: Bool {
        pendingAttempt != nil
    }

    @discardableResult
    func startLogin() -> DesktopLoginLaunchResult {
        if stateOwner.coordinatorState.isSignedInOrAccountRecoveryState {
            stateOwner.markAlreadySignedIn()
            return DesktopLoginLaunchResult(outcome: .alreadySignedIn, loginURL: nil, expiresAt: nil)
        }

        do {
            let configuration = try configurationLoader()
            let attempt = try makeAttempt(configuration: configuration)
            let loginURL = try loginURL(configuration: configuration, attempt: attempt)

            stateOwner.beginSignIn()
            pendingAttempt = attempt

            guard browserOpener(loginURL) else {
                pendingAttempt = nil
                stateOwner.markSignInLaunchFailed()
                return DesktopLoginLaunchResult(outcome: .launchFailed, loginURL: nil, expiresAt: nil)
            }

            stateOwner.markBrowserPending()
            return DesktopLoginLaunchResult(outcome: .browserPending, loginURL: loginURL, expiresAt: attempt.expiresAt)
        } catch {
            pendingAttempt = nil
            stateOwner.markSignInLaunchFailed()
            return DesktopLoginLaunchResult(outcome: .launchFailed, loginURL: nil, expiresAt: nil)
        }
    }

    @discardableResult
    func handleCallbackURL(_ url: URL) -> DesktopLoginCallbackResult {
        guard callbackRouteMatches(url) else {
            rejectPendingAttempt(reason: .invalidRoute)
            return DesktopLoginCallbackResult(outcome: .invalidCallback(.invalidRoute), handoff: nil)
        }

        let query = callbackQueryItems(url)
        guard let callbackState = query["state"]?.nilIfBlank else {
            rejectPendingAttempt(reason: .missingState)
            return DesktopLoginCallbackResult(outcome: .invalidCallback(.missingState), handoff: nil)
        }

        if consumedStates.contains(callbackState) {
            rejectPendingAttempt(reason: .replayedState)
            return DesktopLoginCallbackResult(outcome: .invalidCallback(.replayedState), handoff: nil)
        }

        guard let attempt = pendingAttempt else {
            stateOwner.rejectSignInCallback(reason: .noPendingAttempt)
            return DesktopLoginCallbackResult(outcome: .invalidCallback(.noPendingAttempt), handoff: nil)
        }

        guard callbackState == attempt.state else {
            rejectPendingAttempt(reason: .mismatchedState)
            return DesktopLoginCallbackResult(outcome: .invalidCallback(.mismatchedState), handoff: nil)
        }

        guard attempt.expiresAt > now() else {
            pendingAttempt = nil
            rememberConsumedState(callbackState)
            stateOwner.markSignInTimedOut()
            return DesktopLoginCallbackResult(outcome: .timedOut, handoff: nil)
        }

        if browserCanceled(query) {
            pendingAttempt = nil
            rememberConsumedState(callbackState)
            stateOwner.cancelSignIn()
            return DesktopLoginCallbackResult(outcome: .canceled, handoff: nil)
        }

        guard let exchangeCode = query["code"]?.nilIfBlank else {
            rejectPendingAttempt(reason: .missingExchangeCode)
            return DesktopLoginCallbackResult(outcome: .invalidCallback(.missingExchangeCode), handoff: nil)
        }

        pendingAttempt = nil
        rememberConsumedState(callbackState)
        stateOwner.markHandoffPending()
        let handoff = DesktopLoginHandoff(
            attemptID: attempt.id,
            state: attempt.state,
            exchangeCode: exchangeCode,
            nonceVerifier: attempt.nonceVerifier
        )
        return DesktopLoginCallbackResult(outcome: .callbackAccepted, handoff: handoff)
    }

    func completeLoginHandoff(_ handoff: DesktopLoginHandoff) async -> RubyWhisperDesktopAccountSnapshot {
        await stateOwner.completeLoginHandoff(handoff, exchanger: handoffExchanger)
    }

    @discardableResult
    func cancelPendingAttempt() -> DesktopLoginBridgeOutcome {
        pendingAttempt = nil
        stateOwner.cancelSignIn()
        return .canceled
    }

    @discardableResult
    func expirePendingAttemptIfNeeded() -> DesktopLoginBridgeOutcome {
        guard let attempt = pendingAttempt else {
            return stateOwner.lastLoginBridgeOutcome
        }

        guard attempt.expiresAt <= now() else {
            return stateOwner.lastLoginBridgeOutcome
        }

        pendingAttempt = nil
        rememberConsumedState(attempt.state)
        stateOwner.markSignInTimedOut()
        return .timedOut
    }

    private func makeAttempt(configuration: DesktopLoginBridgeConfiguration) throws -> DesktopLoginAttempt {
        let nonceVerifier = try Self.randomURLSafeString(byteCount: 32)
        return DesktopLoginAttempt(
            id: uuid(),
            state: try Self.randomURLSafeString(byteCount: 32),
            nonceVerifier: nonceVerifier,
            nonceChallenge: Self.nonceChallenge(for: nonceVerifier),
            expiresAt: now().addingTimeInterval(configuration.attemptTTL)
        )
    }

    private func loginURL(
        configuration: DesktopLoginBridgeConfiguration,
        attempt: DesktopLoginAttempt
    ) throws -> URL {
        guard var components = URLComponents(url: configuration.signInURL, resolvingAgainstBaseURL: false) else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login URL is malformed.")
        }

        var items = components.queryItems ?? []
        items.append(contentsOf: [
            URLQueryItem(name: "desktop", value: "1"),
            URLQueryItem(name: "handoff", value: "callback"),
            URLQueryItem(name: "platform", value: configuration.platform),
            URLQueryItem(name: "app_version", value: configuration.appVersion),
            URLQueryItem(name: "state", value: attempt.state),
            URLQueryItem(name: "nonce_challenge", value: attempt.nonceChallenge),
            URLQueryItem(name: "nonce_method", value: "S256"),
            URLQueryItem(name: "callback_scheme", value: configuration.callbackScheme),
        ])
        if let appChannel = configuration.appChannel {
            items.append(URLQueryItem(name: "app_channel", value: appChannel))
        }
        components.queryItems = items
        components.fragment = nil

        guard let url = components.url else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Desktop login URL is malformed.")
        }
        return url
    }

    private func callbackRouteMatches(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == DesktopLoginBridgeConfiguration.callbackScheme,
              url.host?.lowercased() == DesktopLoginBridgeConfiguration.callbackHost else {
            return false
        }
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return path == DesktopLoginBridgeConfiguration.callbackPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private func callbackQueryItems(_ url: URL) -> [String: String] {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return [:]
        }

        var items: [String: String] = [:]
        for item in components.queryItems ?? [] {
            guard let value = item.value else { continue }
            items[item.name] = value
        }
        return items
    }

    private func browserCanceled(_ query: [String: String]) -> Bool {
        query["status"] == "canceled" || query["error"] == "access_denied"
    }

    private func rejectPendingAttempt(reason: DesktopLoginBridgeFailureReason) {
        if let state = pendingAttempt?.state {
            rememberConsumedState(state)
        }
        pendingAttempt = nil
        stateOwner.rejectSignInCallback(reason: reason)
    }

    private func rememberConsumedState(_ state: String) {
        consumedStates.append(state)
        if consumedStates.count > 16 {
            consumedStates.removeFirst(consumedStates.count - 16)
        }
    }

    private static func randomURLSafeString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        guard status == errSecSuccess else {
            throw DesktopSessionStoreError.keychainWriteFailed(operation: "random", status: status)
        }
        return base64URLEncoded(Data(bytes))
    }

    private static func nonceChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return base64URLEncoded(Data(digest))
    }

    private static func base64URLEncoded(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

struct DesktopLoginHandoffUnavailableExchanger: DesktopLoginHandoffExchanging {
    func exchangeLoginHandoff(_ handoff: DesktopLoginHandoff) async throws -> DesktopSessionMaterial {
        throw RubyWhisperBackendClientError.backend(
            RubyWhisperBackendError(
                code: .serviceUnavailable,
                message: "RubyWhisper login is temporarily unavailable.",
                recovery: .retry,
                desktopState: .signedOut,
                retryable: true
            )
        )
    }
}

private extension DesktopAuthCoordinatorState {
    var isSignedInOrAccountRecoveryState: Bool {
        switch self {
        case .signedInTermsRequired, .trialActive, .trialExhausted, .paidActive,
             .friendOfRubyActive, .paymentFailed, .blocked:
            return true
        case .signedOut, .loginLaunching, .browserPending, .handoffPending,
             .sessionExchanging, .accountRefreshing, .canceled, .error, .unknown:
            return false
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
