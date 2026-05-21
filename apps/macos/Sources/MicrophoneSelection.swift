import Foundation

enum MicrophoneSelection {
    static let defaultID = "default"

    static func normalizedSelectedID(
        _ selectedID: String,
        availableDeviceIDs: [String]
    ) -> String {
        let normalizedID = selectedID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedID.isEmpty, normalizedID != defaultID else {
            return defaultID
        }

        return availableDeviceIDs.contains(normalizedID) ? normalizedID : defaultID
    }
}
