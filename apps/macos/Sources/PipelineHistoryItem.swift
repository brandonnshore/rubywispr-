import Foundation

enum PipelineHistoryItemIntent: String, Codable {
    case dictation
    case commandAutomatic = "command:automatic"
    case commandManual = "command:manual"
}

struct PipelineHistoryItem: Identifiable, Codable {
    let intent: PipelineHistoryItemIntent
    let id: UUID
    let timestamp: Date
    let contextScreenshotStatus: String
    let postProcessingStatus: String
    let debugStatus: String
    let timingSummary: String

    var selectedText: String? { nil }
    var capturedSelection: String? { nil }
    var rawTranscript: String { "" }
    var postProcessedTranscript: String { "" }
    var postProcessingPrompt: String? { nil }
    var systemPrompt: String? { nil }
    var contextSummary: String { "" }
    var contextSystemPrompt: String? { nil }
    var contextPrompt: String? { nil }
    var contextScreenshotDataURL: String? { nil }
    var customVocabulary: String { "" }
    var audioFileName: String? { nil }
    var contextAppName: String? { nil }
    var contextBundleIdentifier: String? { nil }
    var contextWindowTitle: String? { nil }

    init(
        intent: PipelineHistoryItemIntent = .dictation,
        id: UUID = UUID(),
        timestamp: Date,
        contextScreenshotStatus: String,
        postProcessingStatus: String,
        debugStatus: String,
        timingSummary: String = ""
    ) {
        self.intent = intent
        self.id = id
        self.timestamp = timestamp
        self.contextScreenshotStatus = contextScreenshotStatus
        self.postProcessingStatus = postProcessingStatus
        self.debugStatus = debugStatus
        self.timingSummary = Self.sanitizedTimingSummary(timingSummary)
    }

    private enum CodingKeys: String, CodingKey {
        case intent
        case id
        case timestamp
        case contextScreenshotStatus
        case postProcessingStatus
        case debugStatus
        case timingSummary
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.intent = try container.decodeIfPresent(PipelineHistoryItemIntent.self, forKey: .intent) ?? .dictation
        self.id = try container.decode(UUID.self, forKey: .id)
        self.timestamp = try container.decode(Date.self, forKey: .timestamp)
        self.contextScreenshotStatus = try container.decodeIfPresent(
            String.self,
            forKey: .contextScreenshotStatus
        ) ?? "No screenshot"
        self.postProcessingStatus = try container.decodeIfPresent(String.self, forKey: .postProcessingStatus) ?? ""
        self.debugStatus = try container.decodeIfPresent(String.self, forKey: .debugStatus) ?? ""
        self.timingSummary = Self.sanitizedTimingSummary(
            try container.decodeIfPresent(String.self, forKey: .timingSummary) ?? ""
        )
    }

    private static func sanitizedTimingSummary(_ rawValue: String) -> String {
        let metricKeys: Set<String> = [
            "stop_to_audio_ms",
            "context_wait_ms",
            "upload_response_ms",
            "response_to_insert_ms",
            "insertion_ms",
            "total_stop_to_terminal_ms",
        ]
        let statusKeys: Set<String> = ["context", "status"]
        let allowedStatusCharacters = CharacterSet(
            charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-"
        )

        return rawValue
            .split(separator: " ")
            .compactMap { token -> String? in
                let parts = token.split(separator: "=", maxSplits: 1)
                guard parts.count == 2 else { return nil }

                let key = String(parts[0])
                let value = String(parts[1])

                if metricKeys.contains(key) {
                    guard !value.isEmpty, value.allSatisfy(\.isNumber) else { return nil }
                    return "\(key)=\(String(value.prefix(8)))"
                }

                if statusKeys.contains(key) {
                    let normalized = String(value.map { character in
                        character.unicodeScalars.allSatisfy { allowedStatusCharacters.contains($0) }
                            ? character
                            : "_"
                    })
                    .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
                    .lowercased()
                    guard !normalized.isEmpty else { return nil }
                    return "\(key)=\(String(normalized.prefix(80)))"
                }

                return nil
            }
            .joined(separator: " ")
    }
}
