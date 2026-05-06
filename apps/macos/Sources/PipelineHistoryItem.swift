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
        debugStatus: String
    ) {
        self.intent = intent
        self.id = id
        self.timestamp = timestamp
        self.contextScreenshotStatus = contextScreenshotStatus
        self.postProcessingStatus = postProcessingStatus
        self.debugStatus = debugStatus
    }

    private enum CodingKeys: String, CodingKey {
        case intent
        case id
        case timestamp
        case contextScreenshotStatus
        case postProcessingStatus
        case debugStatus
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
    }
}
