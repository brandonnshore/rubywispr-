import Foundation

struct AdvancedSettingsPresentation: Equatable {
    struct Row: Equatable {
        var title: String
        var value: String
    }

    struct DiagnosticsMetadata: Equatable {
        var appDisplayName: String
        var appVersion: String
        var appBuildNumber: String
        var macOSVersion: String
        var appArchitecture: String
    }

    static let sectionTitles = [
        "Privacy",
        "Diagnostics"
    ]

    static let diagnosticsPrivacyCopy = """
    Diagnostics include only app/build and system metadata. They exclude transcripts, clipboard contents, dictionary terms, prompts, context, screenshots, provider payloads, secrets, env values, and private app/window data.
    """

    let diagnosticsMetadata: DiagnosticsMetadata

    var diagnosticsRows: [Row] {
        [
            Row(title: "App", value: diagnosticsMetadata.appDisplayName),
            Row(title: "Version", value: diagnosticsMetadata.appVersion),
            Row(title: "Build number", value: diagnosticsMetadata.appBuildNumber),
            Row(title: "macOS", value: diagnosticsMetadata.macOSVersion),
            Row(title: "Architecture", value: diagnosticsMetadata.appArchitecture)
        ]
    }

    var diagnosticsCopyText: String {
        "\(diagnosticsMetadata.appDisplayName) \(diagnosticsMetadata.appVersion) (\(diagnosticsMetadata.appBuildNumber))\nmacOS \(diagnosticsMetadata.macOSVersion) (\(diagnosticsMetadata.appArchitecture))"
    }
}
