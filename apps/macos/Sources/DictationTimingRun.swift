import Foundation

struct DictationTimingRun: Equatable {
    private(set) var stopRequestedAtMs: Int?
    private(set) var artifactReadyAtMs: Int?
    private(set) var contextWaitStartedAtMs: Int?
    private(set) var contextWaitFinishedAtMs: Int?
    private(set) var contextStatus: String?
    private(set) var uploadStartedAtMs: Int?
    private(set) var backendResponseAtMs: Int?
    private(set) var insertionStartedAtMs: Int?
    private(set) var insertionFinishedAtMs: Int?
    private(set) var terminalStatus: String?

    var isEmpty: Bool {
        stopRequestedAtMs == nil &&
            artifactReadyAtMs == nil &&
            contextWaitStartedAtMs == nil &&
            contextWaitFinishedAtMs == nil &&
            contextStatus == nil &&
            uploadStartedAtMs == nil &&
            backendResponseAtMs == nil &&
            insertionStartedAtMs == nil &&
            insertionFinishedAtMs == nil &&
            terminalStatus == nil
    }

    mutating func markStopRequested(nowMs: Int = Self.nowMs()) {
        stopRequestedAtMs = nowMs
        terminalStatus = "recording_stopped"
    }

    mutating func markArtifactReady(nowMs: Int = Self.nowMs()) {
        artifactReadyAtMs = nowMs
        terminalStatus = "audio_ready"
    }

    mutating func markContextSkipped(reason: String, nowMs: Int = Self.nowMs()) {
        contextStatus = normalizedStatus(reason)
        contextWaitStartedAtMs = nowMs
        contextWaitFinishedAtMs = nowMs
    }

    mutating func markContextWaitStarted(nowMs: Int = Self.nowMs()) {
        contextWaitStartedAtMs = nowMs
        contextStatus = "waiting"
    }

    mutating func markContextWaitFinished(status: String, nowMs: Int = Self.nowMs()) {
        contextWaitFinishedAtMs = nowMs
        contextStatus = normalizedStatus(status)
    }

    mutating func markUploadStarted(nowMs: Int = Self.nowMs()) {
        uploadStartedAtMs = nowMs
        terminalStatus = "uploading"
    }

    mutating func markBackendResponse(nowMs: Int = Self.nowMs()) {
        backendResponseAtMs = nowMs
        terminalStatus = "backend_response"
    }

    mutating func markInsertionStarted(nowMs: Int = Self.nowMs()) {
        insertionStartedAtMs = nowMs
        terminalStatus = "inserting"
    }

    mutating func markInsertionFinished(outcome: String, nowMs: Int = Self.nowMs()) {
        insertionFinishedAtMs = nowMs
        terminalStatus = normalizedStatus(outcome)
    }

    mutating func markTerminalStatus(_ status: String) {
        terminalStatus = normalizedStatus(status)
    }

    var safeSummary: String {
        guard !isEmpty else { return "" }

        let fields: [(String, String?)] = [
            ("stop_to_audio_ms", elapsed(from: stopRequestedAtMs, to: artifactReadyAtMs)),
            ("context_wait_ms", elapsed(from: contextWaitStartedAtMs, to: contextWaitFinishedAtMs)),
            ("context", contextStatus),
            ("upload_response_ms", elapsed(from: uploadStartedAtMs, to: backendResponseAtMs)),
            ("response_to_insert_ms", elapsed(from: backendResponseAtMs, to: insertionStartedAtMs)),
            ("insertion_ms", elapsed(from: insertionStartedAtMs, to: insertionFinishedAtMs)),
            ("total_stop_to_terminal_ms", totalElapsed),
            ("status", terminalStatus),
        ]

        return fields.compactMap { key, value in
            guard let value, !value.isEmpty else { return nil }
            return "\(key)=\(value)"
        }
        .joined(separator: " ")
    }

    private var totalElapsed: String? {
        guard let stopRequestedAtMs else { return nil }
        let terminalMs = insertionFinishedAtMs ?? backendResponseAtMs ?? uploadStartedAtMs ?? contextWaitFinishedAtMs ?? artifactReadyAtMs
        return elapsed(from: stopRequestedAtMs, to: terminalMs)
    }

    private func elapsed(from start: Int?, to end: Int?) -> String? {
        guard let start, let end else { return nil }
        return String(max(0, end - start))
    }

    private func normalizedStatus(_ status: String) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-")
        let normalized = String(status.map { character in
            character.unicodeScalars.allSatisfy { allowed.contains($0) } ? character : "_"
        })
        .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        .lowercased()

        return normalized.isEmpty ? "unknown" : String(normalized.prefix(80))
    }

    static func nowMs() -> Int {
        Int((CFAbsoluteTimeGetCurrent() * 1000).rounded())
    }
}
