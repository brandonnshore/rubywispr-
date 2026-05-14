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
            try await testLoginHandoffExchangeUsesNoStoreMetadataAndReturnsSessionMaterial()
            try await testLoginHandoffExchangeRejectsUnacceptedEnvelope()
            try await testAccountSnapshotMapsDocumentedSuccessStates()
            try await testAccountSnapshotMapsFailureResponsesFailClosed()
            try await testExpiredSessionRefreshClearsLocalSession()
            try await testBackendErrorMappingRedactsDiagnostics()
            try await testSignedOutDoesNotCallTransport()
            try await testTransportFailureMapsToNetworkError()
            try await testBinaryTranscriptionRequestMapping()
            try await testMultipartTranscriptionRequestMapping()
            try testDesktopUploadFactoryChoosesBinaryForSimpleDictation()
            try await testMultipartTranscriptionOmitsDisabledContextAndDictionary()
            try await testDesktopMultipartFactoryAppliesCleanupPrivacyControls()
            try await testTranscriptionRequestDoesNotShapeRecentWisprsPayload()
            try await testTranscriptionRequestDoesNotShapeClipboardFallbackPayload()
            try await testTranscriptionRequestRedactedDiagnosticSummary()
            try await testTranscriptionRequestRejectsInvalidDurationWithoutContent()
            try await testTranscriptionSuccessMapsCleanedTextAndUsageOnly()
            try await testUploadTerminalStateRoutesSuccessToInsertionAndCleanedTextRecoveryPolicy()
            try await testCanceledUploadTerminalStateDropsInsertionFailureAndRecovery()
            testLocalDurationLimitFailureMapsToStartNewWhisperWithoutRetry()
            try await testTranscriptionBackendErrorMappingUsesStableRecovery()
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

    private static func testLoginHandoffExchangeUsesNoStoreMetadataAndReturnsSessionMaterial() async throws {
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "accessToken": "session_placeholder_redacted_exchanged",
                  "refreshToken": "refresh_placeholder_redacted_exchanged",
                  "expiresAt": "2099-12-31T00:00:00Z",
                  "accountID": "acct_test"
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: nil, transport: transport)
        let handoff = DesktopLoginHandoff(
            attemptID: UUID(uuidString: "00000000-0000-0000-0000-000000000061")!,
            state: "state_placeholder_redacted",
            exchangeCode: "exchange_placeholder_redacted",
            nonceVerifier: "nonce_placeholder_redacted"
        )

        let session = try await client.exchangeLoginHandoff(handoff)

        expect(session.accessToken == "session_placeholder_redacted_exchanged", "exchange should decode access token into session material")
        expect(session.refreshToken == "refresh_placeholder_redacted_exchanged", "exchange should decode refresh token into session material")
        expect(session.accountID == "acct_test", "exchange should decode account ID into session material")
        expect(transport.requests.count == 1, "exchange should call transport once")

        let captured = transport.requests[0]
        let request = captured.request
        let body = String(data: captured.body ?? Data(), encoding: .utf8) ?? ""

        expect(request.httpMethod == "POST", "exchange request should be POST")
        expect(request.url?.absoluteString == "https://backend.example.test/api/desktop/login/exchange", "exchange request should target desktop login exchange route")
        expect(request.value(forHTTPHeaderField: "Authorization") == nil, "exchange request should not attach a stale Authorization header before session exists")
        expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json", "exchange request should send JSON")
        expect(request.value(forHTTPHeaderField: "Cache-Control") == "no-store", "exchange request should send no-store")
        expect(request.value(forHTTPHeaderField: "Pragma") == "no-cache", "exchange request should send no-cache")
        expect(request.value(forHTTPHeaderField: "X-RubyWhisper-App-Version") == "0.1.0-test", "exchange request should include app version metadata")
        expect(request.value(forHTTPHeaderField: "X-RubyWhisper-OS-Version") == "macOS synthetic", "exchange request should include OS metadata")
        expect(request.value(forHTTPHeaderField: "X-RubyWhisper-Platform") == "macos", "exchange request should include platform metadata")
        expect(body.contains("\"state\":\"state_placeholder_redacted\""), "exchange body should include handoff state")
        expect(body.contains("\"code\":\"exchange_placeholder_redacted\""), "exchange body should include single-use exchange code")
        expect(body.contains("\"nonce_verifier\":\"nonce_placeholder_redacted\""), "exchange body should include nonce verifier")

        let handoffDescription = String(describing: handoff)
        expect(!handoffDescription.contains("exchange_placeholder_redacted"), "handoff diagnostics should redact exchange code")
        expect(!handoffDescription.contains("nonce_placeholder_redacted"), "handoff diagnostics should redact nonce verifier")
    }

    private static func testLoginHandoffExchangeRejectsUnacceptedEnvelope() async throws {
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": false,
                  "accessToken": "session_placeholder_redacted_unaccepted"
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: nil, transport: transport)
        let handoff = DesktopLoginHandoff(
            attemptID: UUID(uuidString: "00000000-0000-0000-0000-000000000061")!,
            state: "state_placeholder_redacted",
            exchangeCode: "exchange_placeholder_redacted",
            nonceVerifier: "nonce_placeholder_redacted"
        )

        do {
            _ = try await client.exchangeLoginHandoff(handoff)
            expect(false, "unaccepted exchange envelope should not return session material")
        } catch let error as RubyWhisperBackendClientError {
            expect(
                error == .invalidResponse("Desktop login exchange was not accepted."),
                "unaccepted exchange envelope should fail with stable invalid response"
            )
        }
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
        expect(serviceUnavailableSnapshot.state == .error, "service_unavailable account refresh should map stable error state")
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
        expect(internalErrorSnapshot.state == .error, "internal_error account refresh should map stable error state")
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

    private static func testExpiredSessionRefreshClearsLocalSession() async throws {
        let store = MemorySessionStore(
            session: DesktopSessionMaterial(
                accessToken: "session_placeholder_redacted_expired",
                refreshToken: "refresh_placeholder_redacted",
                expiresAt: Date(timeIntervalSince1970: 1_700_000_000),
                accountID: "acct_test"
            )
        )
        let transport = CapturingTransport(stubs: [])
        let client = try makeClient(sessionStore: store, transport: transport)

        let snapshot = await client.refreshAccountSnapshot()

        expect(snapshot.state == .signedOut, "expired session should fail closed to signed_out")
        expect(snapshot.canTranscribe == false, "expired session should disable dictation")
        expect(snapshot.recovery == .openSignIn, "expired session should recover through sign-in")
        expect(store.read() == nil, "expired session refresh should clear local session material")
        expect(transport.requests.isEmpty, "expired session should not call transport")
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
        expect(captured.request.value(forHTTPHeaderField: "X-RubyWhisper-App-Version") == "0.1.0-test", "transcription request should include app version metadata")
        expect(captured.request.value(forHTTPHeaderField: "X-RubyWhisper-OS-Version") == "macOS synthetic", "transcription request should include OS metadata")
        expect(captured.request.value(forHTTPHeaderField: "X-RubyWhisper-Platform") == "macos", "transcription request should include platform metadata")
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
        expect(body.contains("filename=\"audio.bin\""), "multipart filename should be content-free")
        expect(!body.contains("recording.wav"), "multipart body should not include caller or user-derived filenames")
        expect(body.contains("name=\"audioDurationMs\""), "multipart body should include duration metadata")
        expect(body.contains("2345"), "multipart body should include duration value")
        expect(body.contains("name=\"appVersion\""), "multipart body should include backend-parsed app version metadata")
        expect(body.contains("0.1.0-test"), "multipart body should include app version value")
        expect(body.contains("name=\"osVersion\""), "multipart body should include backend-parsed OS metadata")
        expect(body.contains("macOS synthetic"), "multipart body should include OS version value")
        expect(body.contains("name=\"platform\""), "multipart body should include platform metadata")
        expect(body.contains("macos"), "multipart body should include platform value")
        expect(body.contains("name=\"appChannel\""), "multipart body should include channel metadata when configured")
        expect(body.contains("test"), "multipart body should include channel value")
        expect(body.contains("name=\"context\""), "multipart body should include optional context field")
        expect(body.contains("name=\"dictionaryTerms\""), "multipart body should include dictionary terms")
    }

    private static func testDesktopUploadFactoryChoosesBinaryForSimpleDictation() throws {
        let audio = Data([0x52, 0x57, 0x10])
        let metadata = RubyWhisperDesktopTranscriptionRequestMetadata(
            appVersion: "0.1.0-test",
            appChannel: "test",
            osVersion: "macOS synthetic",
            platform: "macos"
        )

        let simple = RubyWhisperDesktopTranscriptionRequest.desktopUpload(
            audio: audio,
            context: nil,
            dictionaryTerms: [],
            audioMimeType: "audio/wav",
            audioDurationMs: 1111,
            privacyControls: .enabled
        )

        expect(simple.contentType == "audio/wav", "simple dictation should use binary audio content type")
        let simpleBody = try simple.httpBody(metadata: metadata)
        expect(simpleBody == audio, "simple dictation should send raw audio bytes")

        let withPayload = RubyWhisperDesktopTranscriptionRequest.desktopUpload(
            audio: audio,
            context: "context_placeholder_transient",
            dictionaryTerms: [],
            audioMimeType: "audio/wav",
            audioDurationMs: 1111,
            privacyControls: .enabled
        )
        let payloadBody = String(data: try withPayload.httpBody(metadata: metadata), encoding: .utf8) ?? ""

        expect(withPayload.contentType.hasPrefix("multipart/form-data; boundary="), "context payload should keep multipart upload")
        expect(payloadBody.contains("name=\"context\""), "multipart upload should include context payload when present")
    }

    private static func testMultipartTranscriptionOmitsDisabledContextAndDictionary() async throws {
        let audio = Data([0x52, 0x57, 0x03])
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "requestId": "req_test_disabled_payload",
                  "cleanedText": "Synthetic disabled payload text.",
                  "cleanedWordCount": 4
                }
                """.utf8)
            ),
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "requestId": "req_test_context_disabled_payload",
                  "cleanedText": "Synthetic context disabled text.",
                  "cleanedWordCount": 4
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: "session_placeholder_redacted_disabled_payload", transport: transport)

        _ = try await client.transcribe(
            RubyWhisperDesktopTranscriptionRequest(
                body: .multipart(
                    audio: audio,
                    context: "context_placeholder_omitted",
                    dictionaryTerms: ["term_placeholder_omitted"]
                ),
                audioMimeType: "audio/wav",
                audioDurationMs: 3456,
                cleanupEnabled: false,
                contextAwareCleanupEnabled: true
            )
        )

        let body = String(data: transport.requests[0].body ?? Data(), encoding: .utf8) ?? ""
        expect(body.contains("name=\"cleanupEnabled\""), "multipart body should include cleanup flag")
        expect(body.contains("false"), "multipart body should include disabled cleanup value")
        expect(!body.contains("name=\"context\""), "multipart body should omit context when cleanup is disabled")
        expect(!body.contains("name=\"dictionaryTerms\""), "multipart body should omit dictionary terms when cleanup is disabled")
        expect(!body.contains("context_placeholder_omitted"), "multipart body should omit context content")
        expect(!body.contains("term_placeholder_omitted"), "multipart body should omit dictionary content")

        _ = try await client.transcribe(
            RubyWhisperDesktopTranscriptionRequest(
                body: .multipart(
                    audio: audio,
                    context: "context_placeholder_context_disabled",
                    dictionaryTerms: ["term_placeholder_context_disabled"]
                ),
                audioMimeType: "audio/wav",
                audioDurationMs: 3456,
                cleanupEnabled: true,
                contextAwareCleanupEnabled: false
            )
        )

        let contextDisabledBody = String(data: transport.requests[1].body ?? Data(), encoding: .utf8) ?? ""
        expect(contextDisabledBody.contains("name=\"contextAwareCleanupEnabled\""), "multipart body should include context cleanup flag")
        expect(!contextDisabledBody.contains("name=\"context\""), "multipart body should omit context when context-aware cleanup is disabled")
        expect(!contextDisabledBody.contains("context_placeholder_context_disabled"), "multipart body should omit disabled context content")
        expect(contextDisabledBody.contains("name=\"dictionaryTerms\""), "multipart body may include dictionary terms when cleanup remains enabled")
    }

    private static func testDesktopMultipartFactoryAppliesCleanupPrivacyControls() async throws {
        let metadata = RubyWhisperDesktopTranscriptionRequestMetadata(
            appVersion: "0.1.0-test",
            appChannel: "test",
            osVersion: "macOS synthetic",
            platform: "macos"
        )
        let disabledCleanup = RubyWhisperDesktopTranscriptionRequest.desktopMultipart(
            audio: Data([0x52, 0x57, 0x08]),
            context: "context_placeholder_disabled_cleanup",
            dictionaryTerms: ["term_placeholder_disabled_cleanup"],
            audioMimeType: "audio/wav",
            audioDurationMs: 5678,
            privacyControls: CleanupPrivacyControls(
                cleanupEnabled: false,
                contextAwareCleanupEnabled: true
            )
        )

        expect(!disabledCleanup.cleanupEnabled, "factory should preserve disabled cleanup flag")
        expect(!disabledCleanup.contextAwareCleanupEnabled, "disabled cleanup should make context-aware cleanup ineffective")
        let disabledCleanupBody = String(data: try disabledCleanup.httpBody(metadata: metadata), encoding: .utf8) ?? ""
        expect(!disabledCleanupBody.contains("name=\"context\""), "disabled cleanup should omit context field at assembly seam")
        expect(!disabledCleanupBody.contains("name=\"dictionaryTerms\""), "disabled cleanup should omit dictionary terms at assembly seam")
        expect(!disabledCleanupBody.contains("context_placeholder_disabled_cleanup"), "disabled cleanup should omit context content")
        expect(!disabledCleanupBody.contains("term_placeholder_disabled_cleanup"), "disabled cleanup should omit dictionary content")

        let disabledContext = RubyWhisperDesktopTranscriptionRequest.desktopMultipart(
            audio: Data([0x52, 0x57, 0x09]),
            context: "context_placeholder_disabled_context",
            dictionaryTerms: ["term_placeholder_cleanup_still_enabled"],
            audioMimeType: "audio/wav",
            audioDurationMs: 5678,
            privacyControls: CleanupPrivacyControls(
                cleanupEnabled: true,
                contextAwareCleanupEnabled: false
            )
        )

        expect(disabledContext.cleanupEnabled, "cleanup should remain enabled when only context-aware cleanup is off")
        expect(!disabledContext.contextAwareCleanupEnabled, "factory should preserve disabled context-aware cleanup flag")
        let disabledContextBody = String(data: try disabledContext.httpBody(metadata: metadata), encoding: .utf8) ?? ""
        expect(!disabledContextBody.contains("name=\"context\""), "disabled context-aware cleanup should omit context field")
        expect(!disabledContextBody.contains("context_placeholder_disabled_context"), "disabled context-aware cleanup should omit context content")
        expect(disabledContextBody.contains("name=\"dictionaryTerms\""), "dictionary terms should remain when cleanup is enabled")
        expect(disabledContextBody.contains("term_placeholder_cleanup_still_enabled"), "cleanup-enabled request should include dictionary content in body only")
    }

    private static func testTranscriptionRequestDoesNotShapeRecentWisprsPayload() async throws {
        let audio = Data([0x52, 0x57, 0x70])
        let request = RubyWhisperDesktopTranscriptionRequest(
            body: .multipart(
                audio: audio,
                context: "context_placeholder_allowed_transient",
                dictionaryTerms: ["term_placeholder_allowed_transient"]
            ),
            audioMimeType: "audio/wav",
            audioDurationMs: 4567
        )
        let metadata = RubyWhisperDesktopTranscriptionRequestMetadata(
            appVersion: "0.1.0-test",
            appChannel: "test",
            osVersion: "macOS synthetic",
            platform: "macos"
        )

        let body = String(data: try request.httpBody(metadata: metadata), encoding: .utf8) ?? ""
        let summary = request.redactedDiagnosticSummary(metadata: metadata)
        let renderedSummary = summary
            .map { "\($0.key)=\($0.value)" }
            .sorted()
            .joined(separator: "\n")
        let requestSurface = body + "\n" + renderedSummary

        for forbidden in [
            "recentWispr",
            "RecentWispr",
            "recent_wispr",
            "finalText",
            "cleanedText",
            "rawTranscript",
            "insertionStatus",
            "copiedAt",
            "clipboard",
        ] {
            expect(!requestSurface.contains(forbidden), "transcription request shape should not include \(forbidden)")
        }
    }

    private static func testTranscriptionRequestDoesNotShapeClipboardFallbackPayload() async throws {
        let audio = Data([0x52, 0x57, 0x71])
        let request = RubyWhisperDesktopTranscriptionRequest(
            body: .multipart(
                audio: audio,
                context: "context_placeholder_allowed_transient",
                dictionaryTerms: ["term_placeholder_allowed_transient"]
            ),
            audioMimeType: "audio/wav",
            audioDurationMs: 4567
        )
        let metadata = RubyWhisperDesktopTranscriptionRequestMetadata(
            appVersion: "0.1.0-test",
            appChannel: "test",
            osVersion: "macOS synthetic",
            platform: "macos"
        )

        let body = String(data: try request.httpBody(metadata: metadata), encoding: .utf8) ?? ""
        let summary = request.redactedDiagnosticSummary(metadata: metadata)
        let renderedSummary = summary
            .map { "\($0.key)=\($0.value)" }
            .sorted()
            .joined(separator: "\n")
        let requestSurface = body + "\n" + renderedSummary

        for forbidden in [
            "clipboardFallback",
            "clipboard_fallback",
            "clipboardText",
            "clipboard_text",
            "clipboardContent",
            "previousClipboard",
            "previous_clipboard",
            "localHistory",
            "local_history",
            "recentWisprs",
            "recent_wisprs",
            "finalText",
            "final_text",
            "rawTranscript",
            "raw_transcript",
            "transcriptText",
            "appContext",
            "selectedText",
            "windowTitle",
            "bundleIdentifier",
            "destinationApp",
            "clipboard_fallback_text_placeholder_private",
            "previous_clipboard_placeholder_private",
            "local_history_placeholder_private",
            "app_context_placeholder_private",
        ] {
            expect(!requestSurface.contains(forbidden), "transcription request shape should not include clipboard fallback payload \(forbidden)")
        }
    }

    private static func testTranscriptionRequestRedactedDiagnosticSummary() async throws {
        let audio = Data("audio_payload_placeholder_private".utf8)
        let request = RubyWhisperDesktopTranscriptionRequest(
            body: .multipart(
                audio: audio,
                context: "context_placeholder_private",
                dictionaryTerms: ["term_placeholder_private", " "]
            ),
            audioMimeType: "audio/wav",
            audioDurationMs: 2468
        )
        let metadata = RubyWhisperDesktopTranscriptionRequestMetadata(
            appVersion: "0.1.0-test",
            appChannel: "test",
            osVersion: "macOS synthetic",
            platform: "macos"
        )

        let summary = request.redactedDiagnosticSummary(metadata: metadata)
        let renderedSummary = summary
            .map { "\($0.key)=\($0.value)" }
            .sorted()
            .joined(separator: "\n")

        expect(summary["route"] == "POST /api/desktop/transcribe", "summary should include route without URL query data")
        expect(summary["body"] == "<redacted>", "summary should redact body")
        expect(summary["headers"] == "<redacted>", "summary should redact headers")
        expect(summary["audio"] == "<redacted>", "summary should redact audio")
        expect(summary["multipartFilename"] == "<redacted>", "summary should redact multipart filename")
        expect(summary["audioByteCount"] == String(audio.count), "summary may include audio byte count")
        expect(summary["dictionaryTermCount"] == "1", "summary may include dictionary term count only")
        expect(summary["contextIncluded"] == "true", "summary may include context inclusion boolean")
        expect(!renderedSummary.contains("audio_payload_placeholder_private"), "summary should not include audio bytes")
        expect(!renderedSummary.contains("context_placeholder_private"), "summary should not include context content")
        expect(!renderedSummary.contains("term_placeholder_private"), "summary should not include dictionary content")
        expect(!renderedSummary.contains("Authorization"), "summary should not include auth header names")
        expect(!renderedSummary.contains("Bearer"), "summary should not include bearer values")
        expect(!renderedSummary.contains("filename="), "summary should not include multipart filenames")
    }

    private static func testTranscriptionRequestRejectsInvalidDurationWithoutContent() async throws {
        let request = RubyWhisperDesktopTranscriptionRequest(
            body: .multipart(
                audio: Data("audio_payload_placeholder_invalid_duration".utf8),
                context: "context_placeholder_invalid_duration",
                dictionaryTerms: ["term_placeholder_invalid_duration"]
            ),
            audioMimeType: "audio/wav",
            audioDurationMs: 0
        )

        do {
            _ = try request.httpBody()
            expect(false, "invalid duration should not build a request body")
        } catch let error as RubyWhisperBackendClientError {
            let description = String(describing: error)
            expect(description.contains("Audio duration must be positive."), "invalid duration should throw a stable content-free error")
            expect(!description.contains("audio_payload_placeholder_invalid_duration"), "invalid duration error should not include audio")
            expect(!description.contains("context_placeholder_invalid_duration"), "invalid duration error should not include context")
            expect(!description.contains("term_placeholder_invalid_duration"), "invalid duration error should not include dictionary terms")
        }
    }

    private static func testTranscriptionSuccessMapsCleanedTextAndUsageOnly() async throws {
        let transport = CapturingTransport(stubs: [
            .init(
                statusCode: 200,
                headers: ["Cache-Control": "no-store"],
                body: Data("""
                {
                  "ok": true,
                  "requestId": "req_test_success_mapping",
                  "cleanedText": "  Cleaned text only.  ",
                  "cleanedWordCount": 3,
                  "trialWordsRemaining": 4997,
                  "trialWordsUsed": 3,
                  "trialWordsLimit": 5000,
                  "planState": "trial_active",
                  "audioDurationMs": 1234,
                  "provider": "groq",
                  "providerLatencyMs": 42,
                  "appVersion": "0.1.0-test",
                  "osVersion": "macOS synthetic"
                }
                """.utf8)
            ),
        ])
        let client = try makeClient(token: "session_placeholder_redacted_success_mapping", transport: transport)

        let success = try await client.uploadTranscription(
            RubyWhisperDesktopTranscriptionRequest(
                body: .binary(Data([0x52, 0x57, 0x05])),
                audioMimeType: "audio/wav",
                audioDurationMs: 1234
            )
        )

        expect(success.requestId == "req_test_success_mapping", "success should preserve opaque request ID")
        expect(success.cleanedText == "Cleaned text only.", "success should return trimmed cleaned text")
        expect(success.cleanedWordCount == 3, "success should preserve cleaned word count metadata")
        expect(success.usageMetadata.trialWordsRemaining == 4997, "success should map usage remaining metadata")
        expect(success.usageMetadata.trialWordsUsed == 3, "success should map usage used metadata")
        expect(success.usageMetadata.trialWordsLimit == 5000, "success should map usage limit metadata")
        expect(success.usageMetadata.planState == .trialActive, "success should map account plan metadata")
        expect(success.usageMetadata.audioDurationMs == 1234, "success should map duration metadata")
    }

    private static func testUploadTerminalStateRoutesSuccessToInsertionAndCleanedTextRecoveryPolicy() async throws {
        let success = RubyWhisperDesktopTranscriptionSuccess(
            requestId: "req_terminal_success",
            cleanedText: "  Final cleaned text.  ",
            cleanedWordCount: 3,
            usageMetadata: RubyWhisperDesktopTranscriptionUsageMetadata(
                cleanedWordCount: 3,
                trialWordsRemaining: 42,
                trialWordsUsed: 58,
                trialWordsLimit: 100,
                planState: .trialActive,
                audioDurationMs: 1200
            )
        )

        let insertionOnly = RubyWhisperDesktopUploadTerminalState.success(success)
        expect(insertionOnly.insertionInput?.requestId == "req_terminal_success", "success should route opaque request ID to insertion boundary")
        expect(insertionOnly.insertionInput?.cleanedText == "  Final cleaned text.  ", "success insertion input should carry final cleaned text only")
        expect(insertionOnly.insertionInput?.cleanedWordCount == 3, "success insertion input should carry word-count metadata")
        expect(insertionOnly.insertionInput?.usageMetadata.planState == .trialActive, "success insertion input should carry account metadata")
        expect(insertionOnly.failure == nil, "success terminal state should not expose failure")
        expect(insertionOnly.recoveryState.cleanedText == nil, "success should not create local cleaned-text recovery unless policy allows it")

        let recoveryAllowed = RubyWhisperDesktopUploadTerminalState.success(
            success,
            allowCleanedTextRecovery: true
        )
        expect(recoveryAllowed.recoveryState.cleanedText == "Final cleaned text.", "allowed recovery should preserve only trimmed final cleaned text")
    }

    private static func testCanceledUploadTerminalStateDropsInsertionFailureAndRecovery() async throws {
        let canceled = RubyWhisperDesktopUploadTerminalState.canceled

        expect(canceled.insertionInput == nil, "canceled upload should not route insertion input")
        expect(canceled.failure == nil, "canceled upload should not route a backend failure")
        expect(canceled.recoveryState.cleanedText == nil, "canceled upload should not preserve local recovery text")
    }

    private static func testLocalDurationLimitFailureMapsToStartNewWhisperWithoutRetry() {
        var metadata = RubyWhisperBackendErrorMetadata.empty
        metadata.durationLimitMs = 1_000
        metadata.audioDurationMs = 1_001
        let failure = RubyWhisperDesktopTranscriptionFailure(
            error: RubyWhisperBackendError(
                code: .durationLimitReached,
                message: "Recordings are limited to 10 minutes. Start a new whisper.",
                recovery: .startNewWhisper,
                desktopState: .durationLimitReached,
                retryable: false,
                metadata: metadata
            ),
            sameAudioRetryAllowed: true
        )

        expect(failure.code == .durationLimitReached, "local duration failure should use canonical duration code")
        expect(failure.state == .durationLimitReached, "local duration failure should map to duration-limit desktop state")
        expect(failure.recovery == .startNewWhisper, "local duration failure should require a new whisper")
        expect(failure.retryable == false, "local duration failure should not be retryable")
        expect(failure.sameAudioRetryAllowed == false, "local duration failure should never allow same-audio retry")
        expect(failure.durationLimitMs == 1_000, "local duration failure should expose numeric limit metadata")
        expect(failure.audioDurationMs == 1_001, "local duration failure should expose numeric audio duration metadata")
    }

    private static func testTranscriptionBackendErrorMappingUsesStableRecovery() async throws {
        let cases: [(name: String, statusCode: Int, code: String, state: RubyWhisperDesktopState, recovery: RubyWhisperDesktopRecoveryAction, retryable: Bool, retryAfterSeconds: Int?)] = [
            ("signed out", 401, "signed_out", .signedOut, .openSignIn, false, nil),
            ("terms required", 403, "terms_required", .signedInTermsRequired, .openTermsAcceptance, false, nil),
            ("trial exhausted", 402, "trial_exhausted", .trialExhausted, .openCheckout, false, nil),
            ("subscription required", 402, "subscription_required", .trialExhausted, .openCheckout, false, nil),
            ("payment failed", 402, "payment_failed", .paymentFailed, .openBilling, false, nil),
            ("account blocked", 403, "account_blocked", .blocked, .openAccount, false, nil),
            ("rate limited", 429, "rate_limited", .error, .retryAfter, true, 30),
            ("duration limit", 413, "duration_limit_reached", .durationLimitReached, .startNewWhisper, false, nil),
            ("invalid audio", 422, "invalid_audio", .error, .recordAgain, false, nil),
            ("provider error", 503, "provider_error", .providerError, .retry, true, nil),
            ("network error", 503, "network_error", .networkError, .retry, true, nil),
            ("service unavailable", 503, "service_unavailable", .error, .retry, true, nil),
            ("internal error", 500, "internal_error", .error, .retryOrContactSupport, true, nil),
        ]

        for testCase in cases {
            let metadata = testCase.retryAfterSeconds.map { ",\"metadata\":{\"retryAfterSeconds\":\($0)}" } ?? ""
            let transport = CapturingTransport(stubs: [
                .init(
                    statusCode: testCase.statusCode,
                    headers: ["Cache-Control": "no-store"],
                    body: Data("""
                    {
                      "ok": false,
                      "requestId": "req_test_transcription_error",
                      "errorCode": "\(testCase.code)"\(metadata)
                    }
                    """.utf8)
                ),
            ])
            let client = try makeClient(token: "session_placeholder_redacted_error_\(testCase.code)", transport: transport)

            do {
                _ = try await client.transcribe(
                    RubyWhisperDesktopTranscriptionRequest(
                        body: .binary(Data([0x52, 0x57, 0x04])),
                        audioMimeType: "audio/wav",
                        audioDurationMs: 4567
                    )
                )
                expect(false, "\(testCase.name) should throw backend error")
            } catch RubyWhisperBackendClientError.backend(let error) {
                expect(error.code.rawValue == testCase.code, "\(testCase.name) should preserve canonical code")
                expect(error.desktopState == testCase.state, "\(testCase.name) should map desktop state")
                expect(error.recovery == testCase.recovery, "\(testCase.name) should map recovery")
                expect(error.retryable == testCase.retryable, "\(testCase.name) should map retryability")
                expect(error.metadata.retryAfterSeconds == testCase.retryAfterSeconds, "\(testCase.name) should map retry delay metadata")

                let failure = RubyWhisperDesktopTranscriptionFailure(error: error)
                expect(failure.state == testCase.state, "\(testCase.name) upload failure should map desktop state")
                expect(failure.recovery == testCase.recovery, "\(testCase.name) upload failure should map recovery")
                expect(failure.retryable == testCase.retryable, "\(testCase.name) upload failure should map retryability")
                expect(failure.sameAudioRetryAllowed == false, "\(testCase.name) upload failure should not allow blind same-audio retry")

                let terminalState = RubyWhisperDesktopUploadTerminalState.failure(failure)
                expect(terminalState.failure == failure, "\(testCase.name) terminal state should preserve sanitized upload failure")
                expect(terminalState.insertionInput == nil, "\(testCase.name) terminal state should not route insertion input")
                expect(terminalState.recoveryState.cleanedText == nil, "\(testCase.name) terminal state should not preserve cleaned text without local policy")

                let description = String(describing: RubyWhisperBackendClientError.backend(error))
                expect(!description.contains("Synthetic disabled payload text."), "\(testCase.name) diagnostics should not include cleaned text")
                expect(!description.contains("Authorization"), "\(testCase.name) diagnostics should not include auth headers")
                expect(!description.contains("Bearer"), "\(testCase.name) diagnostics should not include bearer values")
            }
        }
    }

    private static func testLegacyPartialTranscriptionErrorMappingUsesStableRecovery() async throws {
        let cases: [(name: String, statusCode: Int, code: String, state: RubyWhisperDesktopState, recovery: RubyWhisperDesktopRecoveryAction, retryable: Bool)] = [
            ("rate limited", 429, "rate_limited", .error, .retryAfter, true),
            ("duration limit", 413, "duration_limit_reached", .durationLimitReached, .startNewWhisper, false),
            ("invalid audio", 422, "invalid_audio", .error, .recordAgain, false),
            ("provider error", 503, "provider_error", .providerError, .retry, true),
        ]

        for testCase in cases {
            let transport = CapturingTransport(stubs: [
                .init(
                    statusCode: testCase.statusCode,
                    headers: ["Cache-Control": "no-store"],
                    body: Data("""
                    {
                      "ok": false,
                      "requestId": "req_test_transcription_error",
                      "errorCode": "\(testCase.code)"
                    }
                    """.utf8)
                ),
            ])
            let client = try makeClient(token: "session_placeholder_redacted_error_\(testCase.code)", transport: transport)

            do {
                _ = try await client.transcribe(
                    RubyWhisperDesktopTranscriptionRequest(
                        body: .binary(Data([0x52, 0x57, 0x04])),
                        audioMimeType: "audio/wav",
                        audioDurationMs: 4567
                    )
                )
                expect(false, "\(testCase.name) should throw backend error")
            } catch RubyWhisperBackendClientError.backend(let error) {
                expect(error.code.rawValue == testCase.code, "\(testCase.name) should preserve canonical code")
                expect(error.desktopState == testCase.state, "\(testCase.name) should map desktop state")
                expect(error.recovery == testCase.recovery, "\(testCase.name) should map recovery")
                expect(error.retryable == testCase.retryable, "\(testCase.name) should map retryability")

                let description = String(describing: RubyWhisperBackendClientError.backend(error))
                expect(!description.contains("Synthetic disabled payload text."), "\(testCase.name) diagnostics should not include cleaned text")
                expect(!description.contains("Authorization"), "\(testCase.name) diagnostics should not include auth headers")
                expect(!description.contains("Bearer"), "\(testCase.name) diagnostics should not include bearer values")
            }
        }
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
