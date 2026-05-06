import Foundation
import SwiftUI

enum MacAppearancePreference: String, CaseIterable, Codable, Identifiable {
    case light
    case system
    case dark

    static let defaultPreference: MacAppearancePreference = .light

    var id: String { rawValue }

    var title: String {
        switch self {
        case .light:
            return "Light"
        case .system:
            return "System"
        case .dark:
            return "Dark"
        }
    }

    var detail: String {
        switch self {
        case .light:
            return "Use RubyWhisper's launch-safe light appearance."
        case .system:
            return "Follow the current macOS appearance."
        case .dark:
            return "Use dark appearance for SwiftUI app surfaces."
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .light:
            return .light
        case .system:
            return nil
        case .dark:
            return .dark
        }
    }

    static func normalized(rawValue: String?) -> MacAppearancePreference {
        rawValue.flatMap(MacAppearancePreference.init(rawValue:)) ?? defaultPreference
    }
}

struct AppearanceSettingsPresentation: Equatable {
    let selectedPreference: MacAppearancePreference

    static let options: [MacAppearancePreference] = [
        .light,
        .system,
        .dark,
    ]
    static let launchDirectionCopy = "RubyWhisper launches light-first. System and dark are available as local display preferences."
    static let localOnlyCopy = "Saved only on this Mac. This preference never includes transcripts, clipboard contents, dictionary terms, provider payloads, or env values."

    var selectedTitle: String {
        selectedPreference.title
    }

    var selectedDetail: String {
        selectedPreference.detail
    }
}

struct UserDefaultsAppearanceSettingsStore {
    static let defaultStorageKey = "mac_appearance_preference"

    var defaults: UserDefaults
    var storageKey: String

    init(
        defaults: UserDefaults = .standard,
        storageKey: String = Self.defaultStorageKey
    ) {
        self.defaults = defaults
        self.storageKey = storageKey
    }

    var selectedPreference: MacAppearancePreference {
        get {
            MacAppearancePreference.normalized(rawValue: defaults.string(forKey: storageKey))
        }
        nonmutating set {
            defaults.set(newValue.rawValue, forKey: storageKey)
        }
    }
}
