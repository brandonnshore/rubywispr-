import Foundation

struct RubyWhisperBackendConfiguration: Equatable {
    static let defaultBundleBaseURLKey = "RubyWhisperBackendBaseURL"
    static let defaultEnvironmentBaseURLKey = "RUBYWHISPER_BACKEND_BASE_URL"

    var baseURL: URL
    var appVersion: String
    var appChannel: String?
    var osVersion: String
    var platform: String

    init(
        baseURL: URL,
        appVersion: String = RubyWhisperBackendConfiguration.currentAppVersion(),
        appChannel: String? = nil,
        osVersion: String = RubyWhisperBackendConfiguration.currentOSVersion(),
        platform: String = "macos"
    ) throws {
        self.baseURL = try Self.normalizedBaseURL(baseURL)
        self.appVersion = appVersion
        self.appChannel = appChannel?.nilIfBlank
        self.osVersion = osVersion
        self.platform = platform
    }

    static func load(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> RubyWhisperBackendConfiguration {
        let configuredBaseURL =
            environment[defaultEnvironmentBaseURLKey]?.nilIfBlank ??
            (bundle.object(forInfoDictionaryKey: defaultBundleBaseURLKey) as? String)?.nilIfBlank ??
            "https://rubywhisper.invalid"

        guard let baseURL = URL(string: configuredBaseURL) else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Backend base URL is malformed.")
        }

        return try RubyWhisperBackendConfiguration(
            baseURL: baseURL,
            appVersion: currentAppVersion(bundle: bundle),
            appChannel: bundle.object(forInfoDictionaryKey: "RubyWhisperAppChannel") as? String,
            osVersion: currentOSVersion()
        )
    }

    private static func normalizedBaseURL(_ baseURL: URL) throws -> URL {
        guard let scheme = baseURL.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Backend base URL must use http or https.")
        }

        guard baseURL.host?.nilIfBlank != nil else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Backend base URL must include a host.")
        }

        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.query = nil
        components?.fragment = nil
        guard let normalized = components?.url else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Backend base URL is malformed.")
        }

        return normalized
    }

    private static func currentAppVersion(bundle: Bundle = .main) -> String {
        let shortVersion = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let buildVersion = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String

        if let shortVersion = shortVersion?.nilIfBlank,
           let buildVersion = buildVersion?.nilIfBlank,
           shortVersion != buildVersion {
            return "\(shortVersion) (\(buildVersion))"
        }

        return shortVersion?.nilIfBlank ?? buildVersion?.nilIfBlank ?? "0.1.0"
    }

    private static func currentOSVersion() -> String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "macOS \(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
    }
}

protocol RubyWhisperBackendTransport {
    func send(_ request: URLRequest, body: Data?) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionRubyWhisperBackendTransport: RubyWhisperBackendTransport {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func send(_ request: URLRequest, body: Data?) async throws -> (Data, HTTPURLResponse) {
        let response: URLResponse
        let data: Data

        if let body {
            (data, response) = try await session.upload(for: request, from: body)
        } else {
            (data, response) = try await session.data(for: request)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw RubyWhisperBackendClientError.invalidResponse("Backend response was not HTTP.")
        }

        return (data, httpResponse)
    }
}

final class RubyWhisperBackendAPIClient: DesktopLoginHandoffExchanging {
    private let configuration: RubyWhisperBackendConfiguration
    private let sessionStore: DesktopSessionStoring
    private let transport: RubyWhisperBackendTransport
    private let decoder: JSONDecoder
    private let now: () -> Date

    init(
        configuration: RubyWhisperBackendConfiguration,
        sessionStore: DesktopSessionStoring = DesktopSessionKeychainStore(),
        transport: RubyWhisperBackendTransport = URLSessionRubyWhisperBackendTransport(),
        now: @escaping () -> Date = Date.init
    ) {
        self.configuration = configuration
        self.sessionStore = sessionStore
        self.transport = transport
        self.now = now

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func fetchAccount() async throws -> RubyWhisperDesktopAccountResponse {
        let request = try authenticatedRequest(path: "/api/desktop/account", method: "GET")
        let (data, response) = try await send(request, body: nil)
        return try decodeResponse(data, response: response, as: RubyWhisperDesktopAccountResponse.self)
    }

    func exchangeLoginHandoff(_ handoff: DesktopLoginHandoff) async throws -> DesktopSessionMaterial {
        let body = try JSONEncoder().encode(DesktopLoginExchangeRequest(
            state: handoff.state,
            code: handoff.exchangeCode,
            nonceVerifier: handoff.nonceVerifier
        ))
        var request = try backendRequest(path: "/api/desktop/login/exchange", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await send(request, body: body)
        let exchangeResponse = try decodeResponse(data, response: response, as: DesktopLoginExchangeResponse.self)
        return try exchangeResponse.sessionMaterial()
    }

    func refreshAccountSnapshot() async -> RubyWhisperDesktopAccountSnapshot {
        do {
            return try await fetchAccount().accountSnapshot()
        } catch RubyWhisperBackendClientError.backend(let error) {
            if error.code == .signedOut {
                try? sessionStore.delete()
            }
            return RubyWhisperDesktopAccountSnapshot(error: error)
        } catch {
            return RubyWhisperDesktopAccountSnapshot(
                state: .signedOut,
                canTranscribe: false,
                recovery: .retry,
                retryable: true,
                failureCode: .serviceUnavailable
            )
        }
    }

    func transcribe(_ transcriptionRequest: RubyWhisperDesktopTranscriptionRequest) async throws -> RubyWhisperDesktopTranscriptionResponse {
        let body = try transcriptionRequest.httpBody(metadata: transcriptionRequestMetadata())
        var request = try authenticatedRequest(path: "/api/desktop/transcribe", method: "POST")

        request.setValue(transcriptionRequest.contentType, forHTTPHeaderField: "Content-Type")
        if case .binary = transcriptionRequest.body {
            request.setValue(String(transcriptionRequest.audioDurationMs), forHTTPHeaderField: "X-RubyWhisper-Audio-Duration-Ms")
            request.setValue(String(transcriptionRequest.cleanupEnabled), forHTTPHeaderField: "X-RubyWhisper-Cleanup-Enabled")
            request.setValue(String(transcriptionRequest.contextAwareCleanupEnabled), forHTTPHeaderField: "X-RubyWhisper-Context-Aware-Cleanup-Enabled")
        }

        let (data, response) = try await send(request, body: body)
        return try decodeResponse(data, response: response, as: RubyWhisperDesktopTranscriptionResponse.self)
    }

    private func transcriptionRequestMetadata() -> RubyWhisperDesktopTranscriptionRequestMetadata {
        RubyWhisperDesktopTranscriptionRequestMetadata(
            appVersion: configuration.appVersion,
            appChannel: configuration.appChannel,
            osVersion: configuration.osVersion,
            platform: configuration.platform
        )
    }

    private func send(_ request: URLRequest, body: Data?) async throws -> (Data, HTTPURLResponse) {
        do {
            return try await transport.send(request, body: body)
        } catch let error as RubyWhisperBackendClientError {
            if case .transportFailed = error {
                throw networkError()
            }
            throw error
        } catch {
            throw networkError()
        }
    }

    private func authenticatedRequest(path: String, method: String) throws -> URLRequest {
        guard let session = sessionStore.read() else {
            throw RubyWhisperBackendClientError.backend(
                RubyWhisperBackendError(
                    code: .signedOut,
                    message: "Sign in to use RubyWhisper.",
                    recovery: .openSignIn,
                    desktopState: .signedOut,
                    retryable: false
                )
            )
        }

        if let expiresAt = session.expiresAt, expiresAt <= now() {
            throw RubyWhisperBackendClientError.backend(
                RubyWhisperBackendError(
                    code: .signedOut,
                    message: "Sign in to use RubyWhisper.",
                    recovery: .openSignIn,
                    desktopState: .signedOut,
                    retryable: false
                )
            )
        }

        var request = try backendRequest(path: path, method: method)
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func backendRequest(path: String, method: String) throws -> URLRequest {
        var request = URLRequest(url: try endpointURL(path: path))
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue(configuration.appVersion, forHTTPHeaderField: "X-RubyWhisper-App-Version")
        request.setValue(configuration.osVersion, forHTTPHeaderField: "X-RubyWhisper-OS-Version")
        request.setValue(configuration.platform, forHTTPHeaderField: "X-RubyWhisper-Platform")
        if let appChannel = configuration.appChannel {
            request.setValue(appChannel, forHTTPHeaderField: "X-RubyWhisper-App-Channel")
        }

        return request
    }

    private func endpointURL(path: String) throws -> URL {
        guard var components = URLComponents(url: configuration.baseURL, resolvingAgainstBaseURL: false) else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Backend base URL is malformed.")
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let endpointPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + [basePath, endpointPath].filter { !$0.isEmpty }.joined(separator: "/")
        components.query = nil
        components.fragment = nil

        guard let url = components.url else {
            throw RubyWhisperBackendClientError.invalidBaseURL("Backend endpoint URL is malformed.")
        }

        return url
    }

    private func decodeResponse<T: Decodable>(_ data: Data, response: HTTPURLResponse, as type: T.Type) throws -> T {
        guard (200..<300).contains(response.statusCode) else {
            throw RubyWhisperBackendClientError.backend(
                try decodeBackendError(data, response: response)
            )
        }

        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw RubyWhisperBackendClientError.decodingFailed(statusCode: response.statusCode)
        }
    }

    private func decodeBackendError(_ data: Data, response: HTTPURLResponse) throws -> RubyWhisperBackendError {
        do {
            let envelope = try decoder.decode(RubyWhisperBackendErrorEnvelope.self, from: data)
            return envelope.mappedError(statusCode: response.statusCode)
        } catch {
            return RubyWhisperBackendError.defaultMapping(statusCode: response.statusCode)
        }
    }

    private func networkError() -> RubyWhisperBackendClientError {
        .backend(
            RubyWhisperBackendError(
                code: .networkError,
                message: "Check your internet connection and try again.",
                recovery: .retry,
                desktopState: .networkError,
                retryable: true
            )
        )
    }
}

private struct DesktopLoginExchangeRequest: Encodable {
    var state: String
    var code: String
    var nonceVerifier: String

    enum CodingKeys: String, CodingKey {
        case state
        case code
        case nonceVerifier = "nonce_verifier"
    }
}

private struct DesktopLoginExchangeResponse: Decodable {
    var ok: Bool
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date?
    var accountID: String?

    func sessionMaterial() throws -> DesktopSessionMaterial {
        guard ok else {
            throw RubyWhisperBackendClientError.invalidResponse("Desktop login exchange was not accepted.")
        }

        let session = DesktopSessionMaterial(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            accountID: accountID
        )
        guard !session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DesktopSessionStoreError.encodingFailed
        }
        return session
    }
}

struct RubyWhisperDesktopAccountResponse: Decodable, Equatable {
    var ok: Bool
    var email: String?
    var termsAccepted: Bool
    var accountStatus: RubyWhisperDesktopAccountStatus
    var canTranscribe: Bool
    var planState: RubyWhisperDesktopPlanState
    var preflightPolicy: String?
    var trialWordsUsed: Int?
    var trialWordsRemaining: Int?
    var trialWordsLimit: Int?
    var isTrialLow: Bool?
    var isTrialExhausted: Bool?
    var monthlyWordsUsed: Int?
    var monthlyPeriodStart: String?
    var lifetimeWordsUsed: Int?
    var billingPortalAvailable: Bool
    var billingPortalUrl: URL?
    var failureCode: RubyWhisperBackendErrorCode?

    func accountSnapshot() -> RubyWhisperDesktopAccountSnapshot {
        if accountStatus == .termsRequired || failureCode == .termsRequired {
            return snapshot(
                state: .signedInTermsRequired,
                canTranscribe: false,
                recovery: .openTermsAcceptance
            )
        }

        if failureCode == .trialExhausted || failureCode == .subscriptionRequired || planState == .trialExhausted {
            return snapshot(
                state: .trialExhausted,
                canTranscribe: false,
                recovery: .openCheckout
            )
        }

        if failureCode == .paymentFailed || planState == .paymentFailed {
            return snapshot(
                state: .paymentFailed,
                canTranscribe: false,
                recovery: .openBilling
            )
        }

        if failureCode == .accountBlocked || planState == .blocked {
            return snapshot(
                state: .blocked,
                canTranscribe: false,
                recovery: .openAccount
            )
        }

        guard accountStatus == .active, canTranscribe else {
            return snapshot(
                state: .error,
                canTranscribe: false,
                recovery: .retryOrContactSupport
            )
        }

        switch planState {
        case .trialActive:
            return snapshot(state: .trialActive, canTranscribe: true)
        case .paidActive:
            return snapshot(state: .paidActive, canTranscribe: true)
        case .friendOfRubyActive:
            return snapshot(state: .friendOfRubyActive, canTranscribe: true)
        case .trialExhausted, .paymentFailed, .blocked:
            return snapshot(
                state: .error,
                canTranscribe: false,
                recovery: .retryOrContactSupport
            )
        case .unknown:
            return snapshot(
                state: .error,
                canTranscribe: false,
                recovery: .retryOrContactSupport
            )
        }
    }

    private func snapshot(
        state: RubyWhisperDesktopState,
        canTranscribe: Bool,
        recovery: RubyWhisperDesktopRecoveryAction? = nil
    ) -> RubyWhisperDesktopAccountSnapshot {
        RubyWhisperDesktopAccountSnapshot(
            state: state,
            canTranscribe: canTranscribe,
            recovery: recovery,
            retryable: false,
            email: email,
            termsAccepted: termsAccepted,
            accountStatus: accountStatus,
            planState: planState,
            preflightPolicy: preflightPolicy,
            trialWordsUsed: trialWordsUsed,
            trialWordsRemaining: trialWordsRemaining,
            trialWordsLimit: trialWordsLimit,
            isTrialLow: isTrialLow,
            isTrialExhausted: isTrialExhausted,
            monthlyWordsUsed: monthlyWordsUsed,
            monthlyPeriodStart: monthlyPeriodStart,
            lifetimeWordsUsed: lifetimeWordsUsed,
            billingPortalAvailable: billingPortalAvailable,
            failureCode: failureCode
        )
    }
}

struct RubyWhisperDesktopAccountSnapshot: Equatable {
    var state: RubyWhisperDesktopState
    var canTranscribe: Bool
    var recovery: RubyWhisperDesktopRecoveryAction?
    var retryable: Bool
    var email: String?
    var termsAccepted: Bool?
    var accountStatus: RubyWhisperDesktopAccountStatus?
    var planState: RubyWhisperDesktopPlanState?
    var preflightPolicy: String?
    var trialWordsUsed: Int?
    var trialWordsRemaining: Int?
    var trialWordsLimit: Int?
    var isTrialLow: Bool?
    var isTrialExhausted: Bool?
    var monthlyWordsUsed: Int?
    var monthlyPeriodStart: String?
    var lifetimeWordsUsed: Int?
    var billingPortalAvailable: Bool?
    var failureCode: RubyWhisperBackendErrorCode?
    var requestId: String?
    var httpStatus: Int?

    init(
        state: RubyWhisperDesktopState,
        canTranscribe: Bool,
        recovery: RubyWhisperDesktopRecoveryAction? = nil,
        retryable: Bool = false,
        email: String? = nil,
        termsAccepted: Bool? = nil,
        accountStatus: RubyWhisperDesktopAccountStatus? = nil,
        planState: RubyWhisperDesktopPlanState? = nil,
        preflightPolicy: String? = nil,
        trialWordsUsed: Int? = nil,
        trialWordsRemaining: Int? = nil,
        trialWordsLimit: Int? = nil,
        isTrialLow: Bool? = nil,
        isTrialExhausted: Bool? = nil,
        monthlyWordsUsed: Int? = nil,
        monthlyPeriodStart: String? = nil,
        lifetimeWordsUsed: Int? = nil,
        billingPortalAvailable: Bool? = nil,
        failureCode: RubyWhisperBackendErrorCode? = nil,
        requestId: String? = nil,
        httpStatus: Int? = nil
    ) {
        self.state = state
        self.canTranscribe = canTranscribe
        self.recovery = recovery
        self.retryable = retryable
        self.email = email
        self.termsAccepted = termsAccepted
        self.accountStatus = accountStatus
        self.planState = planState
        self.preflightPolicy = preflightPolicy
        self.trialWordsUsed = trialWordsUsed
        self.trialWordsRemaining = trialWordsRemaining
        self.trialWordsLimit = trialWordsLimit
        self.isTrialLow = isTrialLow
        self.isTrialExhausted = isTrialExhausted
        self.monthlyWordsUsed = monthlyWordsUsed
        self.monthlyPeriodStart = monthlyPeriodStart
        self.lifetimeWordsUsed = lifetimeWordsUsed
        self.billingPortalAvailable = billingPortalAvailable
        self.failureCode = failureCode
        self.requestId = requestId
        self.httpStatus = httpStatus
    }

    init(error: RubyWhisperBackendError) {
        let mapped = RubyWhisperDesktopAccountSnapshot.mapping(for: error)
        self.init(
            state: mapped.state,
            canTranscribe: false,
            recovery: mapped.recovery,
            retryable: mapped.retryable,
            failureCode: error.code,
            requestId: error.requestId,
            httpStatus: error.httpStatus
        )
    }

    private static func mapping(
        for error: RubyWhisperBackendError
    ) -> (state: RubyWhisperDesktopState, recovery: RubyWhisperDesktopRecoveryAction, retryable: Bool) {
        switch error.code {
        case .signedOut:
            return (.signedOut, .openSignIn, false)
        case .termsRequired:
            return (.signedInTermsRequired, .openTermsAcceptance, false)
        case .trialExhausted, .subscriptionRequired:
            return (.trialExhausted, .openCheckout, false)
        case .paymentFailed:
            return (.paymentFailed, .openBilling, false)
        case .accountBlocked:
            return (.blocked, .openAccount, false)
        case .networkError:
            return (.networkError, .retry, true)
        case .serviceUnavailable, .internalError:
            return (.signedOut, error.recovery ?? .retry, true)
        case .rateLimited:
            return (.error, .retryAfter, true)
        case .durationLimitReached:
            return (.durationLimitReached, .startNewWhisper, false)
        case .invalidAudio:
            return (.error, .recordAgain, false)
        case .providerError:
            return (.providerError, .retry, true)
        case .unknown:
            return (.error, error.recovery ?? .retryOrContactSupport, error.retryable ?? false)
        }
    }
}

struct RubyWhisperDesktopTranscriptionResponse: Decodable, Equatable {
    var ok: Bool
    var requestId: String
    var cleanedText: String
    var cleanedWordCount: Int
    var trialWordsRemaining: Int?
    var trialWordsUsed: Int?
    var trialWordsLimit: Int?
    var planState: RubyWhisperDesktopPlanState?
    var audioDurationMs: Int?
    var provider: String?
    var providerLatencyMs: Int?
    var appVersion: String?
    var osVersion: String?
}

struct RubyWhisperDesktopTranscriptionRequestMetadata: Equatable {
    var appVersion: String?
    var appChannel: String?
    var osVersion: String?
    var platform: String

    init(
        appVersion: String? = nil,
        appChannel: String? = nil,
        osVersion: String? = nil,
        platform: String = "macos"
    ) {
        self.appVersion = appVersion?.nilIfBlank
        self.appChannel = appChannel?.nilIfBlank
        self.osVersion = osVersion?.nilIfBlank
        self.platform = platform.nilIfBlank ?? "macos"
    }
}

struct RubyWhisperDesktopTranscriptionRequest: Equatable {
    enum Body: Equatable {
        case binary(Data)
        case multipart(audio: Data, context: String? = nil, dictionaryTerms: [String] = [])
    }

    private static let safeMultipartAudioFilename = "audio.bin"

    var body: Body
    var audioMimeType: String
    var audioDurationMs: Int
    var cleanupEnabled: Bool
    var contextAwareCleanupEnabled: Bool

    init(
        body: Body,
        audioMimeType: String,
        audioDurationMs: Int,
        cleanupEnabled: Bool = true,
        contextAwareCleanupEnabled: Bool = true
    ) {
        self.body = body
        self.audioMimeType = audioMimeType
        self.audioDurationMs = audioDurationMs
        self.cleanupEnabled = cleanupEnabled
        self.contextAwareCleanupEnabled = contextAwareCleanupEnabled
    }

    var contentType: String {
        switch body {
        case .binary:
            return audioMimeType
        case .multipart:
            return "multipart/form-data; boundary=\(multipartBoundary)"
        }
    }

    func httpBody(metadata: RubyWhisperDesktopTranscriptionRequestMetadata = RubyWhisperDesktopTranscriptionRequestMetadata()) throws -> Data {
        guard audioDurationMs > 0 else {
            throw RubyWhisperBackendClientError.invalidRequest("Audio duration must be positive.")
        }

        switch body {
        case .binary(let data):
            guard !data.isEmpty else {
                throw RubyWhisperBackendClientError.invalidRequest("Audio body is empty.")
            }
            return data
        case .multipart(let audio, let context, let dictionaryTerms):
            guard !audio.isEmpty else {
                throw RubyWhisperBackendClientError.invalidRequest("Audio body is empty.")
            }
            return buildMultipartBody(
                audio: audio,
                metadata: metadata,
                context: context,
                dictionaryTerms: dictionaryTerms
            )
        }
    }

    func redactedDiagnosticSummary(metadata: RubyWhisperDesktopTranscriptionRequestMetadata = RubyWhisperDesktopTranscriptionRequestMetadata()) -> [String: String] {
        var summary = [
            "route": "POST /api/desktop/transcribe",
            "body": "<redacted>",
            "headers": "<redacted>",
            "audio": "<redacted>",
            "audioDurationMs": String(audioDurationMs),
            "audioMimeType": audioMimeType,
            "cleanupEnabled": String(cleanupEnabled),
            "contextAwareCleanupEnabled": String(contextAwareCleanupEnabled),
            "platform": metadata.platform,
        ]

        if let appVersion = metadata.appVersion {
            summary["appVersion"] = appVersion
        }
        if let appChannel = metadata.appChannel {
            summary["appChannel"] = appChannel
        }
        if let osVersion = metadata.osVersion {
            summary["osVersion"] = osVersion
        }

        switch body {
        case .binary(let audio):
            summary["payloadKind"] = "binary"
            summary["audioByteCount"] = String(audio.count)
        case .multipart(let audio, let context, let dictionaryTerms):
            summary["payloadKind"] = "multipart"
            summary["audioByteCount"] = String(audio.count)
            summary["multipartFilename"] = "<redacted>"
            summary["contextIncluded"] = String(cleanupEnabled && contextAwareCleanupEnabled && context?.nilIfBlank != nil)
            summary["dictionaryTermCount"] = String(cleanupEnabled ? dictionaryTerms.compactMap(\.nilIfBlank).count : 0)
        }

        return summary
    }

    private var multipartBoundary: String {
        "RubyWhisperDesktopBoundary"
    }

    private func buildMultipartBody(
        audio: Data,
        metadata: RubyWhisperDesktopTranscriptionRequestMetadata,
        context: String?,
        dictionaryTerms: [String]
    ) -> Data {
        var data = Data()

        appendField("audioDurationMs", String(audioDurationMs), to: &data)
        appendField("audioMimeType", audioMimeType, to: &data)
        appendField("cleanupEnabled", String(cleanupEnabled), to: &data)
        appendField("contextAwareCleanupEnabled", String(contextAwareCleanupEnabled), to: &data)
        appendField("platform", metadata.platform, to: &data)
        if let appVersion = metadata.appVersion {
            appendField("appVersion", appVersion, to: &data)
        }
        if let appChannel = metadata.appChannel {
            appendField("appChannel", appChannel, to: &data)
        }
        if let osVersion = metadata.osVersion {
            appendField("osVersion", osVersion, to: &data)
        }
        if cleanupEnabled,
           contextAwareCleanupEnabled,
           let context = context?.nilIfBlank {
            appendField("context", context, to: &data)
        }
        if cleanupEnabled {
            for term in dictionaryTerms.compactMap(\.nilIfBlank) {
                appendField("dictionaryTerms", term, to: &data)
            }
        }

        data.append("--\(multipartBoundary)\r\n")
        data.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(Self.safeMultipartAudioFilename)\"\r\n")
        data.append("Content-Type: \(audioMimeType)\r\n\r\n")
        data.append(audio)
        data.append("\r\n--\(multipartBoundary)--\r\n")

        return data
    }

    private func appendField(_ name: String, _ value: String, to data: inout Data) {
        data.append("--\(multipartBoundary)\r\n")
        data.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        data.append(value)
        data.append("\r\n")
    }
}

enum RubyWhisperBackendClientError: Error, Equatable, CustomStringConvertible {
    case backend(RubyWhisperBackendError)
    case decodingFailed(statusCode: Int)
    case invalidBaseURL(String)
    case invalidRequest(String)
    case invalidResponse(String)
    case transportFailed

    var description: String {
        switch self {
        case .backend(let error):
            return "RubyWhisperBackendClientError.backend(code: \(error.code.rawValue), requestId: \(error.requestId ?? "<none>"), status: \(error.httpStatus.map(String.init) ?? "<none>"))"
        case .decodingFailed(let statusCode):
            return "RubyWhisperBackendClientError.decodingFailed(status: \(statusCode))"
        case .invalidBaseURL(let message):
            return "RubyWhisperBackendClientError.invalidBaseURL(\(message))"
        case .invalidRequest(let message):
            return "RubyWhisperBackendClientError.invalidRequest(\(message))"
        case .invalidResponse(let message):
            return "RubyWhisperBackendClientError.invalidResponse(\(message))"
        case .transportFailed:
            return "RubyWhisperBackendClientError.transportFailed"
        }
    }
}

struct RubyWhisperBackendError: Error, Equatable {
    var code: RubyWhisperBackendErrorCode
    var requestId: String?
    var httpStatus: Int?
    var message: String?
    var recovery: RubyWhisperDesktopRecoveryAction?
    var desktopState: RubyWhisperDesktopState?
    var retryable: Bool?

    static func defaultMapping(statusCode: Int) -> RubyWhisperBackendError {
        switch statusCode {
        case 401:
            return RubyWhisperBackendError(
                code: .signedOut,
                httpStatus: statusCode,
                message: "Sign in to use RubyWhisper.",
                recovery: .openSignIn,
                desktopState: .signedOut,
                retryable: false
            )
        case 403:
            return RubyWhisperBackendError(
                code: .termsRequired,
                httpStatus: statusCode,
                message: "Accept Terms and Privacy to start dictating.",
                recovery: .openTermsAcceptance,
                desktopState: .signedInTermsRequired,
                retryable: false
            )
        case 500:
            return RubyWhisperBackendError(
                code: .internalError,
                httpStatus: statusCode,
                message: "Something went wrong. Try again.",
                recovery: .retryOrContactSupport,
                desktopState: .error,
                retryable: true
            )
        case 502, 503, 504:
            return RubyWhisperBackendError(
                code: .serviceUnavailable,
                httpStatus: statusCode,
                message: "RubyWhisper is temporarily unavailable.",
                recovery: .retry,
                desktopState: .error,
                retryable: true
            )
        default:
            return RubyWhisperBackendError(
                code: .unknown("http_\(statusCode)"),
                httpStatus: statusCode,
                message: "RubyWhisper backend request failed.",
                recovery: .retryOrContactSupport,
                desktopState: .error,
                retryable: false
            )
        }
    }

    static func defaultMapping(
        code: RubyWhisperBackendErrorCode,
        statusCode: Int
    ) -> RubyWhisperBackendError {
        switch code {
        case .signedOut:
            return RubyWhisperBackendError(
                code: .signedOut,
                httpStatus: statusCode,
                message: "Sign in to use RubyWhisper.",
                recovery: .openSignIn,
                desktopState: .signedOut,
                retryable: false
            )
        case .termsRequired:
            return RubyWhisperBackendError(
                code: .termsRequired,
                httpStatus: statusCode,
                message: "Accept Terms and Privacy to start dictating.",
                recovery: .openTermsAcceptance,
                desktopState: .signedInTermsRequired,
                retryable: false
            )
        case .trialExhausted:
            return RubyWhisperBackendError(
                code: .trialExhausted,
                httpStatus: statusCode,
                message: "Upgrade to keep using RubyWhisper.",
                recovery: .openCheckout,
                desktopState: .trialExhausted,
                retryable: false
            )
        case .subscriptionRequired:
            return RubyWhisperBackendError(
                code: .subscriptionRequired,
                httpStatus: statusCode,
                message: "Choose a plan to keep dictating.",
                recovery: .openCheckout,
                desktopState: .trialExhausted,
                retryable: false
            )
        case .paymentFailed:
            return RubyWhisperBackendError(
                code: .paymentFailed,
                httpStatus: statusCode,
                message: "Update billing to continue.",
                recovery: .openBilling,
                desktopState: .paymentFailed,
                retryable: false
            )
        case .accountBlocked:
            return RubyWhisperBackendError(
                code: .accountBlocked,
                httpStatus: statusCode,
                message: "This account cannot dictate right now.",
                recovery: .openAccount,
                desktopState: .blocked,
                retryable: false
            )
        case .networkError:
            return RubyWhisperBackendError(
                code: .networkError,
                httpStatus: statusCode,
                message: "Check your internet connection and try again.",
                recovery: .retry,
                desktopState: .networkError,
                retryable: true
            )
        case .serviceUnavailable:
            return RubyWhisperBackendError(
                code: .serviceUnavailable,
                httpStatus: statusCode,
                message: "RubyWhisper is temporarily unavailable.",
                recovery: .retry,
                desktopState: .error,
                retryable: true
            )
        case .internalError:
            return RubyWhisperBackendError(
                code: .internalError,
                httpStatus: statusCode,
                message: "Something went wrong. Try again.",
                recovery: .retryOrContactSupport,
                desktopState: .error,
                retryable: true
            )
        case .rateLimited:
            return RubyWhisperBackendError(
                code: .rateLimited,
                httpStatus: statusCode,
                message: "Too many requests. Try again soon.",
                recovery: .retryAfter,
                desktopState: .error,
                retryable: true
            )
        case .durationLimitReached:
            return RubyWhisperBackendError(
                code: .durationLimitReached,
                httpStatus: statusCode,
                message: "Recordings are limited to 10 minutes.",
                recovery: .startNewWhisper,
                desktopState: .durationLimitReached,
                retryable: false
            )
        case .invalidAudio:
            return RubyWhisperBackendError(
                code: .invalidAudio,
                httpStatus: statusCode,
                message: "RubyWhisper could not read that audio.",
                recovery: .recordAgain,
                desktopState: .error,
                retryable: false
            )
        case .providerError:
            return RubyWhisperBackendError(
                code: .providerError,
                httpStatus: statusCode,
                message: "RubyWhisper could not transcribe right now.",
                recovery: .retry,
                desktopState: .providerError,
                retryable: true
            )
        default:
            var fallback = defaultMapping(statusCode: statusCode)
            fallback.code = code
            return fallback
        }
    }
}

enum RubyWhisperBackendErrorCode: Equatable, RawRepresentable, Codable {
    case signedOut
    case termsRequired
    case trialExhausted
    case subscriptionRequired
    case paymentFailed
    case accountBlocked
    case rateLimited
    case durationLimitReached
    case invalidAudio
    case providerError
    case networkError
    case serviceUnavailable
    case internalError
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "signed_out": self = .signedOut
        case "terms_required": self = .termsRequired
        case "trial_exhausted": self = .trialExhausted
        case "subscription_required": self = .subscriptionRequired
        case "payment_failed": self = .paymentFailed
        case "account_blocked": self = .accountBlocked
        case "rate_limited": self = .rateLimited
        case "duration_limit_reached": self = .durationLimitReached
        case "invalid_audio": self = .invalidAudio
        case "provider_error": self = .providerError
        case "network_error": self = .networkError
        case "service_unavailable": self = .serviceUnavailable
        case "internal_error": self = .internalError
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .signedOut: return "signed_out"
        case .termsRequired: return "terms_required"
        case .trialExhausted: return "trial_exhausted"
        case .subscriptionRequired: return "subscription_required"
        case .paymentFailed: return "payment_failed"
        case .accountBlocked: return "account_blocked"
        case .rateLimited: return "rate_limited"
        case .durationLimitReached: return "duration_limit_reached"
        case .invalidAudio: return "invalid_audio"
        case .providerError: return "provider_error"
        case .networkError: return "network_error"
        case .serviceUnavailable: return "service_unavailable"
        case .internalError: return "internal_error"
        case .unknown(let rawValue): return rawValue
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RubyWhisperDesktopAccountStatus: Equatable, RawRepresentable, Codable {
    case active
    case termsRequired
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "active": self = .active
        case "terms_required": self = .termsRequired
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .active: return "active"
        case .termsRequired: return "terms_required"
        case .unknown(let rawValue): return rawValue
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RubyWhisperDesktopPlanState: Equatable, RawRepresentable, Codable {
    case trialActive
    case paidActive
    case friendOfRubyActive
    case trialExhausted
    case paymentFailed
    case blocked
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "trial_active": self = .trialActive
        case "paid_active": self = .paidActive
        case "friend_of_ruby_active": self = .friendOfRubyActive
        case "trial_exhausted": self = .trialExhausted
        case "payment_failed": self = .paymentFailed
        case "blocked": self = .blocked
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .trialActive: return "trial_active"
        case .paidActive: return "paid_active"
        case .friendOfRubyActive: return "friend_of_ruby_active"
        case .trialExhausted: return "trial_exhausted"
        case .paymentFailed: return "payment_failed"
        case .blocked: return "blocked"
        case .unknown(let rawValue): return rawValue
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RubyWhisperDesktopRecoveryAction: Equatable, RawRepresentable, Codable {
    case openSignIn
    case openTermsAcceptance
    case openCheckout
    case openBilling
    case openAccount
    case retryAfter
    case startNewWhisper
    case recordAgain
    case retry
    case retryOrContactSupport
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "open_sign_in": self = .openSignIn
        case "open_terms_acceptance": self = .openTermsAcceptance
        case "open_checkout": self = .openCheckout
        case "open_billing": self = .openBilling
        case "open_account": self = .openAccount
        case "retry_after": self = .retryAfter
        case "start_new_whisper": self = .startNewWhisper
        case "record_again": self = .recordAgain
        case "retry": self = .retry
        case "retry_or_contact_support": self = .retryOrContactSupport
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .openSignIn: return "open_sign_in"
        case .openTermsAcceptance: return "open_terms_acceptance"
        case .openCheckout: return "open_checkout"
        case .openBilling: return "open_billing"
        case .openAccount: return "open_account"
        case .retryAfter: return "retry_after"
        case .startNewWhisper: return "start_new_whisper"
        case .recordAgain: return "record_again"
        case .retry: return "retry"
        case .retryOrContactSupport: return "retry_or_contact_support"
        case .unknown(let rawValue): return rawValue
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum RubyWhisperDesktopState: Equatable, RawRepresentable, Codable {
    case signedOut
    case signedInTermsRequired
    case trialActive
    case paidActive
    case friendOfRubyActive
    case trialExhausted
    case paymentFailed
    case blocked
    case durationLimitReached
    case providerError
    case networkError
    case error
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "signed_out": self = .signedOut
        case "signed_in_terms_required": self = .signedInTermsRequired
        case "trial_active": self = .trialActive
        case "paid_active": self = .paidActive
        case "friend_of_ruby_active": self = .friendOfRubyActive
        case "trial_exhausted": self = .trialExhausted
        case "payment_failed": self = .paymentFailed
        case "blocked": self = .blocked
        case "duration_limit_reached": self = .durationLimitReached
        case "provider_error": self = .providerError
        case "network_error": self = .networkError
        case "error": self = .error
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .signedOut: return "signed_out"
        case .signedInTermsRequired: return "signed_in_terms_required"
        case .trialActive: return "trial_active"
        case .paidActive: return "paid_active"
        case .friendOfRubyActive: return "friend_of_ruby_active"
        case .trialExhausted: return "trial_exhausted"
        case .paymentFailed: return "payment_failed"
        case .blocked: return "blocked"
        case .durationLimitReached: return "duration_limit_reached"
        case .providerError: return "provider_error"
        case .networkError: return "network_error"
        case .error: return "error"
        case .unknown(let rawValue): return rawValue
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

private struct RubyWhisperBackendErrorEnvelope: Decodable {
    struct ErrorBody: Decodable {
        var code: RubyWhisperBackendErrorCode?
        var message: String?
        var retryable: Bool?
        var recovery: RubyWhisperDesktopRecoveryAction?
        var desktopState: RubyWhisperDesktopState?
    }

    var ok: Bool?
    var requestId: String?
    var error: ErrorBody?
    var errorCode: RubyWhisperBackendErrorCode?
    var message: String?

    func mappedError(statusCode: Int) -> RubyWhisperBackendError {
        let statusFallback = RubyWhisperBackendError.defaultMapping(statusCode: statusCode)
        let code = error?.code ?? errorCode ?? statusFallback.code
        let fallback = RubyWhisperBackendError.defaultMapping(code: code, statusCode: statusCode)
        return RubyWhisperBackendError(
            code: code,
            requestId: requestId,
            httpStatus: statusCode,
            message: error?.message ?? message ?? fallback.message,
            recovery: error?.recovery ?? fallback.recovery,
            desktopState: error?.desktopState ?? fallback.desktopState,
            retryable: error?.retryable ?? fallback.retryable
        )
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Data {
    mutating func append(_ string: String) {
        append(Data(string.utf8))
    }
}
