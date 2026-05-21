import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

@main
private struct MicrophoneSelectionTests {
    static func main() {
        testDefaultAndBlankNormalizeToDefault()
        testAvailableDeviceSelectionIsPreserved()
        testStaleDeviceSelectionFallsBackToDefault()
        print("MicrophoneSelectionTests passed")
    }

    private static func testDefaultAndBlankNormalizeToDefault() {
        expect(
            MicrophoneSelection.normalizedSelectedID("", availableDeviceIDs: ["built-in"]) == MicrophoneSelection.defaultID,
            "blank selections should normalize to system default"
        )
        expect(
            MicrophoneSelection.normalizedSelectedID(" default ", availableDeviceIDs: ["built-in"]) == MicrophoneSelection.defaultID,
            "default selections should normalize to system default"
        )
    }

    private static func testAvailableDeviceSelectionIsPreserved() {
        expect(
            MicrophoneSelection.normalizedSelectedID(
                "built-in",
                availableDeviceIDs: ["external", "built-in"]
            ) == "built-in",
            "available saved device selections should be preserved"
        )
    }

    private static func testStaleDeviceSelectionFallsBackToDefault() {
        expect(
            MicrophoneSelection.normalizedSelectedID(
                "disconnected-device",
                availableDeviceIDs: ["built-in"]
            ) == MicrophoneSelection.defaultID,
            "disconnected saved devices should fall back to system default"
        )
    }
}
