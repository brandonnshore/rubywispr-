import Foundation

enum OpenAIRealtimeTranscriptionError: Error, Equatable, LocalizedError {
    case invalidClientSecret
    case invalidWebSocketURL
    case connectionUnavailable
    case emptyTranscript
    case providerError
    case timedOut

    var errorDescription: String? {
        switch self {
        case .invalidClientSecret:
            return "Realtime transcription session was missing a usable client secret."
        case .invalidWebSocketURL:
            return "Realtime transcription WebSocket URL was invalid."
        case .connectionUnavailable:
            return "Realtime transcription connection was unavailable."
        case .emptyTranscript:
            return "Realtime transcription returned no text."
        case .providerError:
            return "Realtime transcription provider returned an error."
        case .timedOut:
            return "Realtime transcription timed out."
        }
    }
}

enum OpenAIRealtimeTranscriptionRecoveryDecision: Equatable {
    case batchFallback
    case cancel

    static func evaluate(error: Error) -> OpenAIRealtimeTranscriptionRecoveryDecision {
        error is CancellationError ? .cancel : .batchFallback
    }
}

struct OpenAIRealtimeTranscriptionEvent: Equatable {
    static let deltaEventType = "conversation.item.input_audio_transcription.delta"
    static let completedEventType = "conversation.item.input_audio_transcription.completed"
    static let errorEventType = "error"

    var type: String
    var delta: String?
    var transcript: String?

    static func parse(_ text: String) -> OpenAIRealtimeTranscriptionEvent? {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            return nil
        }

        return OpenAIRealtimeTranscriptionEvent(
            type: type,
            delta: object["delta"] as? String,
            transcript: object["transcript"] as? String
        )
    }

    var completedTranscript: String? {
        guard type == Self.completedEventType else { return nil }
        let trimmed = transcript?.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed?.isEmpty == false ? trimmed : nil
    }

    var isProviderError: Bool {
        type == Self.errorEventType
    }
}

actor OpenAIRealtimeTranscriptionSession {
    private static let maxBufferedPCMBytes = 32 * 1024 * 1024
    private static let connectionTimeoutNanoseconds: UInt64 = 8_000_000_000
    private static let commitTimeoutNanoseconds: UInt64 = 5_000_000_000
    private static let baseCompletionTimeoutNanoseconds: UInt64 = 3_000_000_000
    private static let maxCompletionTimeoutNanoseconds: UInt64 = 20_000_000_000

    private let backendClient: RubyWhisperBackendAPIClient
    private let language: String?
    private let urlSession: URLSession
    private let startedAt = Date()

    private var bufferedPCMChunks: [Data] = []
    private var bufferedPCMByteCount = 0
    private var connectionTask: Task<Void, Error>?
    private var receiveTask: Task<Void, Never>?
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: RubyWhisperDesktopRealtimeTranscriptionSession?
    private var completedTranscript: String?
    private var completionContinuation: CheckedContinuation<String, Error>?
    private var terminalError: Error?

    init(
        backendClient: RubyWhisperBackendAPIClient,
        language: String? = nil,
        urlSession: URLSession = URLSession(configuration: .ephemeral)
    ) {
        self.backendClient = backendClient
        self.language = Self.normalizedLanguage(language)
        self.urlSession = urlSession
    }

    func start() {
        guard connectionTask == nil else { return }

        connectionTask = Task {
            try await self.connect()
        }
    }

    func appendPCM16(_ chunk: Data) async {
        guard !chunk.isEmpty, terminalError == nil else { return }

        guard let webSocketTask else {
            bufferPCMChunk(chunk)
            return
        }

        do {
            try await sendAudioAppend(chunk, webSocketTask: webSocketTask)
        } catch {
            terminalError = error
        }
    }

    func finish(audioDurationMs: Int) async throws -> RubyWhisperDesktopTranscriptionSuccess {
        defer {
            closeConnection()
        }

        start()
        try await waitForConnectionWithTimeout()

        if let terminalError {
            throw terminalError
        }

        guard let session else {
            throw OpenAIRealtimeTranscriptionError.connectionUnavailable
        }
        guard let webSocketTask else {
            throw OpenAIRealtimeTranscriptionError.connectionUnavailable
        }

        try await sendCommitWithTimeout(webSocketTask: webSocketTask)
        let transcript = try await waitForCompletedTranscriptWithTimeout(
            audioDurationMs: audioDurationMs
        )
        let cleanedText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedText.isEmpty else {
            throw OpenAIRealtimeTranscriptionError.emptyTranscript
        }

        let cleanedWordCount = Self.billableWordCount(in: cleanedText)
        let completion = try await backendClient.completeRealtimeTranscription(
            RubyWhisperDesktopRealtimeTranscriptionCompletionRequest(
                requestId: session.requestId,
                audioDurationMs: audioDurationMs,
                cleanedWordCount: cleanedWordCount,
                providerLatencyMs: providerLatencyMs()
            )
        )

        return RubyWhisperDesktopTranscriptionSuccess(
            requestId: completion.requestId,
            cleanedText: cleanedText,
            cleanedWordCount: completion.cleanedWordCount,
            usageMetadata: completion.usageMetadata
        )
    }

    func cancel() {
        connectionTask?.cancel()
        receiveTask?.cancel()
        connectionTask = nil
        receiveTask = nil
        terminalError = CancellationError()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        bufferedPCMChunks.removeAll()
        bufferedPCMByteCount = 0
        if let completionContinuation {
            completionContinuation.resume(throwing: CancellationError())
            self.completionContinuation = nil
        }
    }

    private func closeConnection() {
        receiveTask?.cancel()
        receiveTask = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        bufferedPCMChunks.removeAll()
        bufferedPCMByteCount = 0
    }

    private func connect() async throws {
        let createdSession = try await backendClient.createRealtimeTranscriptionSession(
            language: language
        )
        guard createdSession.clientSecret.hasPrefix("ek_") else {
            throw OpenAIRealtimeTranscriptionError.invalidClientSecret
        }
        guard let url = URL(string: createdSession.webSocketURL) else {
            throw OpenAIRealtimeTranscriptionError.invalidWebSocketURL
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("Bearer \(createdSession.clientSecret)", forHTTPHeaderField: "Authorization")

        let task = urlSession.webSocketTask(with: request)
        webSocketTask = task
        session = createdSession
        task.resume()

        receiveTask = Task {
            await self.receiveLoop(webSocketTask: task)
        }

        try await sendSessionUpdate(webSocketTask: task)
        try await flushBufferedPCM(webSocketTask: task)
    }

    private func waitForConnectionWithTimeout() async throws {
        guard let connectionTask else {
            throw OpenAIRealtimeTranscriptionError.connectionUnavailable
        }

        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask {
                    try await connectionTask.value
                }
                group.addTask {
                    try await Task.sleep(nanoseconds: Self.connectionTimeoutNanoseconds)
                    throw OpenAIRealtimeTranscriptionError.timedOut
                }

                _ = try await group.next()
                group.cancelAll()
            }
        } catch {
            connectionTask.cancel()
            webSocketTask?.cancel(with: .goingAway, reason: nil)
            throw error
        }
    }

    private func bufferPCMChunk(_ chunk: Data) {
        guard bufferedPCMByteCount + chunk.count <= Self.maxBufferedPCMBytes else {
            terminalError = OpenAIRealtimeTranscriptionError.connectionUnavailable
            return
        }

        bufferedPCMChunks.append(chunk)
        bufferedPCMByteCount += chunk.count
    }

    private func flushBufferedPCM(webSocketTask: URLSessionWebSocketTask) async throws {
        let chunks = bufferedPCMChunks
        bufferedPCMChunks.removeAll()
        bufferedPCMByteCount = 0

        for chunk in chunks {
            try Task.checkCancellation()
            try await sendAudioAppend(chunk, webSocketTask: webSocketTask)
        }
    }

    private func receiveLoop(webSocketTask: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let message = try await webSocketTask.receive()
                switch message {
                case .string(let text):
                    handleServerMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        handleServerMessage(text)
                    }
                @unknown default:
                    break
                }
            } catch {
                if completedTranscript == nil && completionContinuation != nil {
                    failCompletion(error)
                }
                return
            }
        }
    }

    private func handleServerMessage(_ text: String) {
        guard let event = OpenAIRealtimeTranscriptionEvent.parse(text) else {
            return
        }

        if event.isProviderError {
            failCompletion(OpenAIRealtimeTranscriptionError.providerError)
            return
        }

        guard let transcript = event.completedTranscript else {
            return
        }

        completedTranscript = transcript
        completionContinuation?.resume(returning: transcript)
        completionContinuation = nil
    }

    private func failCompletion(_ error: Error) {
        terminalError = error
        completionContinuation?.resume(throwing: error)
        completionContinuation = nil
    }

    private func waitForCompletedTranscriptWithTimeout(audioDurationMs: Int) async throws -> String {
        try await withThrowingTaskGroup(of: String.self) { group in
            group.addTask {
                try await self.waitForCompletedTranscript()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: Self.completionTimeoutNanoseconds(audioDurationMs: audioDurationMs))
                throw OpenAIRealtimeTranscriptionError.timedOut
            }

            guard let transcript = try await group.next() else {
                throw OpenAIRealtimeTranscriptionError.timedOut
            }
            group.cancelAll()
            return transcript
        }
    }

    private func waitForCompletedTranscript() async throws -> String {
        if let terminalError {
            throw terminalError
        }
        if let completedTranscript {
            return completedTranscript
        }

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                completionContinuation = continuation
            }
        } onCancel: {
            Task {
                await self.cancelCompletionWait()
            }
        }
    }

    private func cancelCompletionWait() {
        completionContinuation?.resume(throwing: CancellationError())
        completionContinuation = nil
    }

    private func sendCommitWithTimeout(webSocketTask: URLSessionWebSocketTask) async throws {
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask {
                    try await self.sendCommit(webSocketTask: webSocketTask)
                }
                group.addTask {
                    try await Task.sleep(nanoseconds: Self.commitTimeoutNanoseconds)
                    throw OpenAIRealtimeTranscriptionError.timedOut
                }

                _ = try await group.next()
                group.cancelAll()
            }
        } catch {
            webSocketTask.cancel(with: .goingAway, reason: nil)
            throw error
        }
    }

    private func sendSessionUpdate(webSocketTask: URLSessionWebSocketTask) async throws {
        var transcription: [String: Any] = [
            "model": "gpt-realtime-whisper",
            "delay": "minimal",
        ]
        if let language {
            transcription["language"] = language
        }

        try await sendJSONObject(
            [
                "type": "session.update",
                "session": [
                    "type": "transcription",
                    "audio": [
                        "input": [
                            "format": [
                                "type": "audio/pcm",
                                "rate": 24000,
                            ],
                            "transcription": transcription,
                            "turn_detection": NSNull(),
                        ],
                    ],
                ],
            ],
            webSocketTask: webSocketTask
        )
    }

    private func sendAudioAppend(
        _ chunk: Data,
        webSocketTask: URLSessionWebSocketTask
    ) async throws {
        try await sendJSONObject(
            [
                "type": "input_audio_buffer.append",
                "audio": chunk.base64EncodedString(),
            ],
            webSocketTask: webSocketTask
        )
    }

    private func sendCommit(webSocketTask: URLSessionWebSocketTask) async throws {
        try await sendJSONObject(
            [
                "type": "input_audio_buffer.commit",
            ],
            webSocketTask: webSocketTask
        )
    }

    private func sendJSONObject(
        _ object: [String: Any],
        webSocketTask: URLSessionWebSocketTask
    ) async throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        guard let text = String(data: data, encoding: .utf8) else {
            throw OpenAIRealtimeTranscriptionError.providerError
        }
        try await webSocketTask.send(.string(text))
    }

    private func providerLatencyMs() -> Int {
        max(0, Int(Date().timeIntervalSince(startedAt) * 1000))
    }

    static func billableWordCount(in text: String) -> Int {
        let normalized = text.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return 0 }

        let pattern = #"[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?"#
        let regex = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(normalized.startIndex..<normalized.endIndex, in: normalized)
        return regex?.numberOfMatches(in: normalized, range: range) ?? 0
    }

    static func completionTimeoutNanoseconds(audioDurationMs: Int) -> UInt64 {
        let clampedDurationMs = min(max(audioDurationMs, 0), 600_000)
        let durationAllowance = UInt64(clampedDurationMs) * 25_000
        return min(
            baseCompletionTimeoutNanoseconds + durationAllowance,
            maxCompletionTimeoutNanoseconds
        )
    }

    static func realtimeFinalizationBudgetNanoseconds(audioDurationMs: Int) -> UInt64 {
        connectionTimeoutNanoseconds
            + commitTimeoutNanoseconds
            + completionTimeoutNanoseconds(audioDurationMs: audioDurationMs)
    }

    private static func normalizedLanguage(_ language: String?) -> String? {
        let trimmedLanguage = language?.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedLanguage?.isEmpty == false ? trimmedLanguage : nil
    }
}
