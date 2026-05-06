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

private final class FeedProbe {
    var requests: [URLRequest] = []
    var response = UpdateFeedResponse(data: Data("[]".utf8), statusCode: 200)

    func load(_ request: URLRequest) async throws -> UpdateFeedResponse {
        requests.append(request)
        return response
    }
}

private func makeDefaults(_ suffix: String) -> UserDefaults {
    let suiteName = "com.rubywhisper.update-manager.tests.\(suffix).\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
        FileHandle.standardError.write(Data("FAIL: could not create test defaults\n".utf8))
        exit(1)
    }
    defaults.removePersistentDomain(forName: suiteName)
    return defaults
}

@MainActor
private func makeManager(
    configuration: UpdateChannelConfiguration,
    defaults: UserDefaults = makeDefaults("manager"),
    currentVersion: String = "1.0.0",
    currentBuildTag: String? = "v1.0.0",
    now: Date = Date(timeIntervalSince1970: 1_768_021_200),
    probe: FeedProbe
) -> UpdateManager {
    UpdateManager(
        configuration: configuration,
        defaults: defaults,
        appInfoDictionary: {
            var info: [String: Any] = [
                "CFBundleShortVersionString": currentVersion
            ]
            if let currentBuildTag {
                info["RubyWhisperBuildTag"] = currentBuildTag
            }
            return info
        },
        now: { now },
        releaseFeedLoader: probe.load
    )
}

private let syntheticReleasesJSON = """
[
  {
    "tag_name": "notes-only",
    "name": "Notes only",
    "body": "Not a semantic release",
    "html_url": "https://updates.example.test/releases/notes-only",
    "published_at": "2026-01-01T00:00:00Z",
    "assets": []
  },
  {
    "tag_name": "v1.1.0",
    "name": "RubyWhisper 1.1.0",
    "body": "## Changes\\n- First synthetic update\\n\\n## Download\\nSynthetic only",
    "html_url": "https://updates.example.test/releases/v1.1.0",
    "published_at": "2026-01-01T00:00:00Z",
    "assets": [
      {
        "name": "RubyWhisper-1.1.0.dmg",
        "browser_download_url": "https://downloads.example.test/RubyWhisper-1.1.0.dmg",
        "size": 100
      }
    ]
  },
  {
    "tag_name": "v1.2.0",
    "name": "RubyWhisper 1.2.0",
    "body": "## Changes\\n- Second synthetic update\\n\\n## Download\\nSynthetic only",
    "html_url": "https://updates.example.test/releases/v1.2.0",
    "published_at": "2026-01-02T00:00:00Z",
    "assets": [
      {
        "name": "RubyWhisper-1.2.0.dmg",
        "browser_download_url": "https://downloads.example.test/RubyWhisper-1.2.0.dmg",
        "size": 200
      }
    ]
  }
]
""".data(using: .utf8)!

@main
private struct UpdateManagerTests {
    static func main() async {
        await testDefaultChannelIsDisabledAndDoesNotFetch()
        testConfiguredChannelParsingRequiresExplicitHTTPS()
        await testConfiguredChannelUsesSyntheticFeedAndSelectsLatestSemanticRelease()
        await testCurrentAndSkippedVersionsDoNotOfferUpdate()
        await testSafeErrorStatesClearUpdateWithoutRealNetwork()

        print("UpdateManagerTests passed")
    }

    private static func testDefaultChannelIsDisabledAndDoesNotFetch() async {
        let configuration = UpdateChannelConfiguration(infoDictionary: [:])
        let probe = FeedProbe()
        let manager = await makeManager(configuration: configuration, probe: probe)

        await manager.checkForUpdates(userInitiated: false)

        let snapshot = await MainActor.run {
            (
                manager.isUpdateChannelEnabled,
                manager.autoCheckEnabled,
                manager.updateAvailable,
                manager.latestRelease,
                manager.updateChannelDisabledMessage
            )
        }

        expect(snapshot.0 == false, "empty config should leave update channel disabled")
        expect(snapshot.1 == false, "auto-check should be false when channel is disabled")
        expect(snapshot.2 == false, "disabled channel should not expose an available update")
        expect(snapshot.3 == nil, "disabled channel should clear latest release")
        expect(snapshot.4.contains("Updates are disabled"), "disabled channel should expose clear disabled copy")
        expect(probe.requests.isEmpty, "disabled channel should not fetch a release feed")
    }

    private static func testConfiguredChannelParsingRequiresExplicitHTTPS() {
        let valid = UpdateChannelConfiguration(infoDictionary: [
            UpdateChannelConfiguration.enabledInfoKey: true,
            UpdateChannelConfiguration.releasesURLInfoKey: " https://updates.example.test/releases.json "
        ])
        expect(
            valid.releasesURL?.absoluteString == "https://updates.example.test/releases.json",
            "enabled HTTPS config should parse release feed URL"
        )
        expect(valid.isEnabled, "enabled HTTPS config should enable update channel")

        let disabledWithURL = UpdateChannelConfiguration(infoDictionary: [
            UpdateChannelConfiguration.releasesURLInfoKey: "https://updates.example.test/releases.json"
        ])
        expect(!disabledWithURL.isEnabled, "release URL alone should not enable update channel")

        let invalidHTTP = UpdateChannelConfiguration(infoDictionary: [
            UpdateChannelConfiguration.enabledInfoKey: "true",
            UpdateChannelConfiguration.releasesURLInfoKey: "http://updates.example.test/releases.json"
        ])
        expect(!invalidHTTP.isEnabled, "configured release feed must use HTTPS")
        expect(invalidHTTP.disabledMessage.contains("invalid"), "invalid config should explain disabled state")
    }

    private static func testConfiguredChannelUsesSyntheticFeedAndSelectsLatestSemanticRelease() async {
        let feedURL = URL(string: "https://updates.example.test/releases.json")!
        let probe = FeedProbe()
        probe.response = UpdateFeedResponse(data: syntheticReleasesJSON, statusCode: 200)
        let manager = await makeManager(
            configuration: UpdateChannelConfiguration(state: .enabled(feedURL)),
            probe: probe
        )

        await manager.checkForUpdates(userInitiated: false)

        let snapshot = await MainActor.run {
            (
                manager.updateAvailable,
                manager.latestReleaseVersion,
                manager.latestRelease?.tagName,
                manager.latestRelease?.body ?? "",
                manager.latestReleaseDate,
                manager.lastCheckDate
            )
        }

        expect(probe.requests.count == 1, "configured channel should fetch exactly one synthetic feed")
        expect(probe.requests.first?.url == feedURL, "configured channel should request configured feed URL")
        expect(
            probe.requests.first?.value(forHTTPHeaderField: "Accept") == "application/vnd.github+json",
            "release feed request should keep GitHub JSON accept header"
        )
        expect(snapshot.0, "newer semantic release should be offered")
        expect(snapshot.1 == "1.2.0", "latest semantic version should be selected")
        expect(snapshot.2 == "v1.2.0", "latest release should keep source tag")
        expect(snapshot.3.contains("Second synthetic update"), "latest release notes should be included")
        expect(snapshot.3.contains("First synthetic update"), "intermediate release notes should be aggregated")
        expect(!snapshot.4.isEmpty, "release date display string should be populated")
        expect(snapshot.5 != nil, "successful check should persist last check date")
    }

    private static func testCurrentAndSkippedVersionsDoNotOfferUpdate() async {
        let feedURL = URL(string: "https://updates.example.test/releases.json")!
        let currentProbe = FeedProbe()
        currentProbe.response = UpdateFeedResponse(data: syntheticReleasesJSON, statusCode: 200)
        let currentManager = await makeManager(
            configuration: UpdateChannelConfiguration(state: .enabled(feedURL)),
            currentVersion: "1.2.0",
            currentBuildTag: "v1.2.0",
            probe: currentProbe
        )

        await currentManager.checkForUpdates(userInitiated: false)
        let currentSnapshot = await MainActor.run {
            (currentManager.updateAvailable, currentManager.latestReleaseVersion)
        }
        expect(!currentSnapshot.0, "current build tag should not be offered as an update")
        expect(currentSnapshot.1 == "1.2.0", "current-version check should still parse latest semantic release")

        let skippedDefaults = makeDefaults("skipped")
        skippedDefaults.set("v1.2.0", forKey: "updateSkippedVersion")
        let skippedProbe = FeedProbe()
        skippedProbe.response = UpdateFeedResponse(data: syntheticReleasesJSON, statusCode: 200)
        let skippedManager = await makeManager(
            configuration: UpdateChannelConfiguration(state: .enabled(feedURL)),
            defaults: skippedDefaults,
            probe: skippedProbe
        )

        await skippedManager.checkForUpdates(userInitiated: false)
        let skippedSnapshot = await MainActor.run {
            (skippedManager.updateAvailable, skippedManager.latestReleaseVersion)
        }
        expect(!skippedSnapshot.0, "auto-check should not offer a skipped version")
        expect(skippedSnapshot.1 == "1.2.0", "skipped-version check should still parse latest semantic release")
    }

    private static func testSafeErrorStatesClearUpdateWithoutRealNetwork() async {
        let feedURL = URL(string: "https://updates.example.test/releases.json")!
        let probe = FeedProbe()
        probe.response = UpdateFeedResponse(data: syntheticReleasesJSON, statusCode: 200)
        let manager = await makeManager(
            configuration: UpdateChannelConfiguration(state: .enabled(feedURL)),
            probe: probe
        )

        await manager.checkForUpdates(userInitiated: false)
        let hasUpdate = await MainActor.run { manager.updateAvailable }
        expect(hasUpdate, "test setup should establish a visible update before error checks")

        probe.response = UpdateFeedResponse(data: Data("{}".utf8), statusCode: 500)
        await manager.checkForUpdates(userInitiated: false)
        let httpErrorSnapshot = await MainActor.run {
            (manager.updateAvailable, manager.latestRelease, manager.latestReleaseVersion)
        }
        expect(!httpErrorSnapshot.0, "HTTP errors should clear available update state")
        expect(httpErrorSnapshot.1 == nil, "HTTP errors should clear stale latest release")
        expect(httpErrorSnapshot.2.isEmpty, "HTTP errors should clear stale latest version")

        probe.response = UpdateFeedResponse(data: Data("{ not json".utf8), statusCode: 200)
        await manager.checkForUpdates(userInitiated: false)
        let malformedSnapshot = await MainActor.run {
            (manager.updateAvailable, manager.latestRelease, manager.latestReleaseVersion)
        }
        expect(!malformedSnapshot.0, "malformed feed should not offer an update")
        expect(malformedSnapshot.1 == nil, "malformed feed should clear stale latest release")
        expect(malformedSnapshot.2.isEmpty, "malformed feed should clear stale latest version")
    }
}
