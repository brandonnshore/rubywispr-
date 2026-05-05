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
        session = nil
    }
}

private final class CapturingTransport: RubyWhisperBackendTransport {
    struct Stub {
        var statusCode: Int
        var headers: [String: String]
        var body: Data
    }

    private(set) var requests: [(request: URLRequest, body: Data?)] = []
    private var stubs: [Stub]

    init(stubs: [Stub]) {
        self.stubs = stubs
    }

    func send(_ request: URLRequest, body: Data?) async throws -> (Data, HTTPURLResponse) {
        requests.append((request, body))
        guard !stubs.isEmpty else {
            throw RubyWhisperBackendClientError.transportFailed
        }

        let stub = stubs.removeFirst()
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: stub.headers
        )!
        return (stub.body, response)
    }
}

@main
private struct RubyWhisperBackendAPIClientTests {
    static func main() async {
        do {
            try await testAccountRequestUsesSessionAuthMetadataAndNoStore()
            try await testAccountSnapshotMapsDocumentedSuccessStates()
            try await testAccountSnapshotMapsFailureResponsesFailClosed()
            try await testBackendErrorMappingRedactsDiagnostics()
            try await testSignedOutDoesNotCallTransport()
            try await testTransportFailureMapsToNetworkError()
            try await testBinaryTranscriptionRequestMapping()
            try await testMultipartTranscriptionRequestMapping()
            print("RubyWhisperBackendAPIClientTests passed")
        } catch {
            FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
            exit(1)
        }
    }

    private static func testAccountRequestUsesSessionAuthMetadataAndNoStore() async throws {
        let token = "session_placeholder_redacted_account"
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "email": "user@example.test",
                  "termsAccepted": true,
                  "accountStatus": "active",
                  "canTranscribe": true,
                  "planState": "trial_active",
                  "preflightPolicy": "allow_if_started_under_limit",
                  "trialWordsUsed": 1000,
                  "trialWordsRemaining": 4000,
                  "trialWordsLimit": 5000,
                  "isTrialLow": false,
                  "isTrialExhausted": false,
                  "monthlyWordsUsed": 1000,
                  "monthlyPeriodStart": "2026-05-01",
                  "lifetimeWordsUsed": 1000,
                  "billingPortalAvailable": false,
                  "billingPortalUrl": null
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: token, transport: transport)

        let account = try await client.fetchAccount()

        expect(account.ok, "account success should decode")
        expect(account.email == "user@example.test", "account email should decode")
        expect(account.accountStatus == .active, "account status should use stable enum mapping")
        expect(account.planState == .trialActive, "plan state should use stable enum mapping")
        expect(transport.requests.count == 1, "account request should call transport once")

        let request = transport.requests[0].request
        expect(request.httpMethod == "GET", "account request should be GET")
        expect(request.url?.absoluteString == "https://backend.example.test/api/desktop/account", "account request URL should target RubyWhisper backend account route")
        expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(token)", "account request should attach session auth")
        expect(request.value(forHTTPHeaderField: "Cache-Control") == "no-store", "account request should send no-store")
        expect(request.value(forHTTPHeaderField: "Pragma") == "no-cache", "account request should send no-cache")
        expect(request.value(forHTTPHeaderField: "X-RubyWhisper-App-Version") == "0.1.0-test", "account request should include app version metadata")
        expect(request.value(forHTTPHeaderField: "X-RubyWhisper-OS-Version") == "macOS synthetic", "account request should include OS metadata")
        expect(request.value(forHTTPHeaderField: "X-RubyWhisper-Platform") == "macos", "account request should include platform metadata")
    }

    private static func testAccountSnapshotMapsDocumentedSuccessStates() async throws {
        let cases: [(name: String, response: RubyWhisperDesktopAccountResponse, state: RubyWhisperDesktopState, canTranscribe: Bool, recovery: RubyWhisperDesktopRecoveryAction?)] = [
            (
                "trial active",
                makeAccountResponse(planState: .trialActive, canTranscribe: true),
                .trialActive,
                true,
                nil
            ),
            (
                "paid active",
                makeAccountResponse(planState: .paidActive, canTranscribe: true),
                .paidActive,
                true,
                nil
            ),
            (
                "Friend of Ruby active",
                makeAccountResponse(planState: .friendOfRubyActive, canTranscribe: true),
                .friendOfRubyActive,
                true,
                nil
            ),
            (
                "terms required account status",
                makeAccountResponse(accountStatus: .termsRequired, planState: .trialActive, canTranscribe: false),
                .signedInTermsRequired,
                false,
                .openTermsAcceptance
            ),
            (
                "terms required failure code",
                makeAccountResponse(planState: .trialActive, canTranscribe: false, failureCode: .termsRequired),
                .signedInTermsRequired,
                false,
                .openTermsAcceptance
            ),
            (
                "trial exhausted",
                makeAccountResponse(planState: .trialExhausted, canTranscribe: false),
                .trialExhausted,
                false,
                .openCheckout
            ),
            (
                "subscription required",
                makeAccountResponse(planState: .trialActive, canTranscribe: false, failureCode: .subscriptionRequired),
                .trialExhausted,
                false,
                .openCheckout
            ),
            (
                "payment failed",
                makeAccountResponse(planState: .paymentFailed, canTranscribe: false),
                .paymentFailed,
                false,
                .openBilling
            ),
            (
                "account blocked",
                makeAccountResponse(planState: .blocked, canTranscribe: false, failureCode: .accountBlocked),
                .blocked,
                false,
                .openAccount
            ),
        ]

        for testCase in cases {
            let snapshot = testCase.response.accountSnapshot()
            expect(snapshot.state == testCase.state, "\(testCase.name) should map desktop state")
            expect(snapshot.canTranscribe == testCase.canTranscribe, "\(testCase.name) should map dictation gate")
            expect(snapshot.recovery == testCase.recovery, "\(testCase.name) should map recovery")
            expect(snapshot.failureCode == testCase.response.failureCode, "\(testCase.name) should preserve metadata-only failure code")
        }
    }

    private static func testAccountSnapshotMapsFailureResponsesFailClosed() async throws {
        let signedOutStore = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_401"))
        let signedOutSnapshot = try await refreshSnapshot(
            statusCode: 401,
            body: Data(),
            sessionStore: signedOutStore
        )
        expect(signedOutSnapshot.state == .signedOut, "401 should map to signed_out")
        expect(signedOutSnapshot.canTranscribe == false, "401 should disable dictation")
        expect(signedOutSnapshot.recovery == .openSignIn, "401 should recover through sign-in")
        expect(signedOutSnapshot.retryable == false, "401 should not be retryable without login")
        expect(signedOutStore.read() == nil, "401 signed_out should clear local session material")

        let termsRequiredSnapshot = try await refreshSnapshot(statusCode: 403, body: Data())
        expect(termsRequiredSnapshot.state == .signedInTermsRequired, "403 without a more specific code should map to signed_in_terms_required")
        expect(termsRequiredSnapshot.canTranscribe == false, "403 terms_required should disable dictation")
        expect(termsRequiredSnapshot.recovery == .openTermsAcceptance, "403 terms_required should recover through Terms acceptance")
        expect(termsRequiredSnapshot.retryable == false, "403 terms_required should not be retryable until Terms acceptance")

        let serviceUnavailableSnapshot = try await refreshSnapshot(
            statusCode: 503,
            body: Data("""
            {
              "ok": false,
              "requestId": "req_service_unavailable",
              "error": {
                "code": "service_unavailable",
                "message": "RubyWhisper is temporarily unavailable.",
                "retryable": true,
                "recovery": "retry",
                "desktopState": "error"
              }
            }
            """.utf8)
        )
        expect(serviceUnavailableSnapshot.state == .signedOut, "service_unavailable account refresh should fail closed to signed_out until refresh succeeds")
        expect(serviceUnavailableSnapshot.canTranscribe == false, "service_unavailable should not enable dictation")
        expect(serviceUnavailableSnapshot.recovery == .retry, "service_unavailable should be retryable")
        expect(serviceUnavailableSnapshot.retryable == true, "service_unavailable should mark retryable")
        expect(serviceUnavailableSnapshot.requestId == "req_service_unavailable", "service_unavailable should preserve support-safe request ID")

        let internalErrorSnapshot = try await refreshSnapshot(
            statusCode: 500,
            body: Data("""
            {
              "ok": false,
              "error": {
                "code": "internal_error",
                "retryable": true,
                "recovery": "retry_or_contact_support",
                "desktopState": "error"
              }
            }
            """.utf8)
        )
        expect(internalErrorSnapshot.state == .signedOut, "internal_error account refresh should fail closed to signed_out until refresh succeeds")
        expect(internalErrorSnapshot.canTranscribe == false, "internal_error should not enable dictation")
        expect(internalErrorSnapshot.retryable == true, "internal_error should mark retryable")

        let blockedSnapshot = try await refreshSnapshot(
            statusCode: 403,
            body: Data("""
            {
              "ok": false,
              "error": {
                "code": "account_blocked",
                "retryable": false,
                "recovery": "open_account",
                "desktopState": "blocked"
              }
            }
            """.utf8)
        )
        expect(blockedSnapshot.state == .blocked, "403 account_blocked should remain distinct from terms_required")
        expect(blockedSnapshot.canTranscribe == false, "account_blocked should disable dictation")
        expect(blockedSnapshot.recovery == .openAccount, "account_blocked should recover through account surface")
    }

    private static func testBackendErrorMappingRedactsDiagnostics() async throws {
        let token = "session_placeholder_redacted_error"
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 402,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": false,
                  "requestId": "req_test_123",
                  "error": {
                    "code": "trial_exhausted",
                    "message": "Upgrade to keep using RubyWhisper.",
                    "retryable": false,
                    "recovery": "open_checkout",
                    "desktopState": "trial_exhausted"
                  },
                  "metadata": {
                    "planState": "trial_exhausted",
                    "trialWordsRemaining": 0
                  }
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: token, transport: transport)

        do {
            _ = try await client.fetchAccount()
            expect(false, "backend error should throw")
        } catch RubyWhisperBackendClientError.backend(let error) {
            expect(error.code == .trialExhausted, "backend error code should map")
            expect(error.requestId == "req_test_123", "backend request ID should map")
            expect(error.recovery == .openCheckout, "backend recovery should map")
            expect(error.desktopState == .trialExhausted, "backend desktop state should map")

            let description = String(describing: RubyWhisperBackendClientError.backend(error))
            expect(!description.contains(token), "diagnostics should not include session token")
            expect(!description.contains("Authorization"), "diagnostics should not include header names")
            expect(!description.contains("Bearer"), "diagnostics should not include bearer header value")
        }
    }

    private static func testSignedOutDoesNotCallTransport() async throws {
        let transport = CapturingTransport(stubs: [])
        let client = try makeClient(token: nil, transport: transport)

        do {
            _ = try await client.fetchAccount()
            expect(false, "missing session should throw signed_out")
        } catch RubyWhisperBackendClientError.backend(let error) {
            expect(error.code == .signedOut, "missing session should map to signed_out")
            expect(transport.requests.isEmpty, "signed_out should not call transport")
        }
    }

    private static func testTransportFailureMapsToNetworkError() async throws {
        let token = "session_placeholder_redacted_network"
        let transport = CapturingTransport(stubs: [])
        let client = try makeClient(token: token, transport: transport)

        do {
            _ = try await client.fetchAccount()
            expect(false, "transport failure should throw network_error")
        } catch RubyWhisperBackendClientError.backend(let error) {
            expect(error.code == .networkError, "transport failure should map to network_error")
            expect(error.recovery == .retry, "transport failure should use retry recovery")
            expect(error.desktopState == .networkError, "transport failure should map to network desktop state")
            expect(error.retryable == true, "transport failure should be retryable")
            expect(transport.requests.count == 1, "transport failure should occur after one request attempt")

            let description = String(describing: RubyWhisperBackendClientError.backend(error))
            expect(!description.contains(token), "transport diagnostics should not include session token")
            expect(!description.contains("Authorization"), "transport diagnostics should not include header names")
            expect(!description.contains("Bearer"), "transport diagnostics should not include bearer header value")
        }
    }

    private static func testBinaryTranscriptionRequestMapping() async throws {
        let token = "session_placeholder_redacted_transcribe"
        let audio = Data([0x52, 0x57, 0x00, 0x01])
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "requestId": "req_test_transcribe",
                  "cleanedText": "Synthetic cleaned text.",
                  "cleanedWordCount": 3,
                  "trialWordsRemaining": 4997,
                  "trialWordsUsed": 3,
                  "trialWordsLimit": 5000,
                  "planState": "trial_active",
                  "audioDurationMs": 1234,
                  "provider": "groq",
                  "appVersion": "0.1.0-test",
                  "osVersion": "macOS synthetic"
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: token, transport: transport)

        let response = try await client.transcribe(
            RubyWhisperDesktopTranscriptionRequest(
                body: .binary(audio),
                audioMimeType: "audio/wav",
                audioDurationMs: 1234,
                cleanupEnabled: true,
                contextAwareCleanupEnabled: false
            )
        )

        expect(response.requestId == "req_test_transcribe", "transcription request ID should decode")
        expect(response.cleanedText == "Synthetic cleaned text.", "cleaned text should decode")
        expect(response.planState == .trialActive, "transcription plan state should map")
        expect(transport.requests.count == 1, "transcription request should call transport once")

        let captured = transport.requests[0]
        expect(captured.request.httpMethod == "POST", "transcription request should be POST")
        expect(captured.request.url?.absoluteString == "https://backend.example.test/api/desktop/transcribe", "transcription request URL should target RubyWhisper backend transcribe route")
        expect(captured.request.value(forHTTPHeaderField: "Authorization") == "Bearer \(token)", "transcription request should attach session auth")
        expect(captured.request.value(forHTTPHeaderField: "Content-Type") == "audio/wav", "binary transcription content type should be audio MIME")
        expect(captured.request.value(forHTTPHeaderField: "X-RubyWhisper-Audio-Duration-Ms") == "1234", "binary transcription should include duration metadata")
        expect(captured.request.value(forHTTPHeaderField: "X-RubyWhisper-Cleanup-Enabled") == "true", "binary transcription should include cleanup flag")
        expect(captured.request.value(forHTTPHeaderField: "X-RubyWhisper-Context-Aware-Cleanup-Enabled") == "false", "binary transcription should include context cleanup flag")
        expect(captured.body == audio, "binary transcription body should be audio bytes")
    }

    private static func testMultipartTranscriptionRequestMapping() async throws {
        let audio = Data([0x52, 0x57, 0x02])
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "requestId": "req_test_multipart",
                  "cleanedText": "Synthetic multipart text.",
                  "cleanedWordCount": 3
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: "session_placeholder_redacted_multipart", transport: transport)

        _ = try await client.transcribe(
            RubyWhisperDesktopTranscriptionRequest(
                body: .multipart(
                    audio: audio,
                    filename: "recording.wav",
                    context: "Synthetic app context.",
                    dictionaryTerms: ["term_placeholder_alpha", "term_placeholder_beta"]
                ),
                audioMimeType: "audio/wav",
                audioDurationMs: 2345
            )
        )

        let captured = transport.requests[0]
        let body = String(data: captured.body ?? Data(), encoding: .utf8) ?? ""
        expect(captured.request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true, "multipart transcription should set multipart content type")
        expect(body.contains("name=\"audio\""), "multipart body should include audio part")
        expect(body.contains("name=\"audioDurationMs\""), "multipart body should include duration metadata")
        expect(body.contains("2345"), "multipart body should include duration value")
        expect(body.contains("name=\"context\""), "multipart body should include optional context field")
        expect(body.contains("name=\"dictionaryTerms\""), "multipart body should include dictionary terms")
    }

    private static func makeClient(
        token: String?,
        transport: CapturingTransport
    ) throws -> RubyWhisperBackendAPIClient {
        try makeClient(sessionStore: MemorySessionStore(session: token.map { sessionMaterial(token: $0) }), transport: transport)
    }

    private static func makeClient(
        sessionStore: DesktopSessionStoring,
        transport: CapturingTransport
    ) throws -> RubyWhisperBackendAPIClient {
        let configuration = try RubyWhisperBackendConfiguration(
            baseURL: URL(string: "https://backend.example.test")!,
            appVersion: "0.1.0-test",
            appChannel: "test",
            osVersion: "macOS synthetic"
        )
        return RubyWhisperBackendAPIClient(
            configuration: configuration,
            sessionStore: sessionStore,
            transport: transport,
            now: { Date(timeIntervalSince1970: 1_800_000_000) }
        )
    }

    private static func refreshSnapshot(
        statusCode: Int,
        body: Data,
        sessionStore: MemorySessionStore = MemorySessionStore(session: sessionMaterial(token: "session_placeholder_redacted_snapshot"))
    ) async throws -> RubyWhisperDesktopAccountSnapshot {
        let transport = CapturingTransport(stubs: [
            .init(statusCode: statusCode, headers: ["Cache-Control": "no-store"], body: body),
        ])
        let client = try makeClient(sessionStore: sessionStore, transport: transport)
        let snapshot = await client.refreshAccountSnapshot()
        expect(transport.requests.count == 1, "account snapshot refresh should call transport once")
        return snapshot
    }

    private static func makeAccountResponse(
        accountStatus: RubyWhisperDesktopAccountStatus = .active,
        planState: RubyWhisperDesktopPlanState,
        canTranscribe: Bool,
        failureCode: RubyWhisperBackendErrorCode? = nil
    ) -> RubyWhisperDesktopAccountResponse {
        RubyWhisperDesktopAccountResponse(
            ok: failureCode == nil,
            email: "user@example.test",
            termsAccepted: accountStatus == .active,
            accountStatus: accountStatus,
            canTranscribe: canTranscribe,
            planState: planState,
            preflightPolicy: "allow_if_started_under_limit",
            trialWordsUsed: 100,
            trialWordsRemaining: 4900,
            trialWordsLimit: 5000,
            isTrialLow: false,
            isTrialExhausted: planState == .trialExhausted,
            monthlyWordsUsed: 100,
            monthlyPeriodStart: "2026-05-01",
            lifetimeWordsUsed: 100,
            billingPortalAvailable: false,
            billingPortalUrl: nil,
            failureCode: failureCode
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
