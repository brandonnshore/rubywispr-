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

private func makeDefaults(_ suffix: String) -> UserDefaults {
    let suiteName = "com.rubywhisper.appearance-settings.tests.\(suffix).\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
        FileHandle.standardError.write(Data("FAIL: could not create test defaults\n".utf8))
        exit(1)
    }
    defaults.removePersistentDomain(forName: suiteName)
    return defaults
}

@main
private struct AppearanceSettingsPresentationTests {
    static func main() {
        testDefaultIsLaunchSafeLight()
        testOptionsAreBoundedAndLightFirst()
        testPersistenceRoundTripUsesOnlyAppearanceValue()
        testInvalidStoredValueFallsBackToLight()
        testCopyBoundaries()

        print("AppearanceSettingsPresentationTests passed")
    }

    private static func testDefaultIsLaunchSafeLight() {
        let defaults = makeDefaults("default")
        let store = UserDefaultsAppearanceSettingsStore(defaults: defaults, storageKey: "appearance_test")
        let presentation = AppearanceSettingsPresentation(selectedPreference: store.selectedPreference)

        expect(store.selectedPreference == .light, "empty defaults should resolve to light")
        expect(presentation.selectedTitle == "Light", "default presentation should label light")
        expect(presentation.selectedDetail.contains("launch-safe light"), "default detail should keep light-first copy")
    }

    private static func testOptionsAreBoundedAndLightFirst() {
        expect(
            AppearanceSettingsPresentation.options == [.light, .system, .dark],
            "options should stay bounded to light, system, and dark"
        )
        expect(
            MacAppearancePreference.allCases == [.light, .system, .dark],
            "enum cases should remain light-first"
        )
    }

    private static func testPersistenceRoundTripUsesOnlyAppearanceValue() {
        let defaults = makeDefaults("round-trip")
        let store = UserDefaultsAppearanceSettingsStore(defaults: defaults, storageKey: "appearance_test")

        store.selectedPreference = .dark
        expect(store.selectedPreference == .dark, "store should persist dark")
        expect(defaults.string(forKey: "appearance_test") == "dark", "store should persist only the raw appearance value")

        store.selectedPreference = .system
        expect(store.selectedPreference == .system, "store should persist system")
        expect(defaults.string(forKey: "appearance_test") == "system", "store should overwrite with the selected value")
    }

    private static func testInvalidStoredValueFallsBackToLight() {
        let defaults = makeDefaults("invalid")
        defaults.set("private_payload_placeholder", forKey: "appearance_test")
        let store = UserDefaultsAppearanceSettingsStore(defaults: defaults, storageKey: "appearance_test")

        expect(store.selectedPreference == .light, "invalid stored values should fall back to light")
    }

    private static func testCopyBoundaries() {
        expect(
            AppearanceSettingsPresentation.launchDirectionCopy.contains("light-first"),
            "launch copy should state light-first direction"
        )
        expect(
            AppearanceSettingsPresentation.localOnlyCopy.contains("Saved only on this Mac"),
            "privacy copy should state local-only persistence"
        )
        expect(
            AppearanceSettingsPresentation.localOnlyCopy.contains("never includes transcripts"),
            "privacy copy should exclude transcripts"
        )
        expect(
            AppearanceSettingsPresentation.localOnlyCopy.contains("clipboard contents"),
            "privacy copy should exclude clipboard contents"
        )
        expect(
            AppearanceSettingsPresentation.localOnlyCopy.contains("dictionary terms"),
            "privacy copy should exclude dictionary terms"
        )
        expect(
            AppearanceSettingsPresentation.localOnlyCopy.contains("provider payloads"),
            "privacy copy should exclude provider payloads"
        )
        expect(
            AppearanceSettingsPresentation.localOnlyCopy.contains("env values"),
            "privacy copy should exclude env values"
        )
    }
}
