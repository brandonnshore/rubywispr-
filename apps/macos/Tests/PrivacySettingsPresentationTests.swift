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

@main
private struct PrivacySettingsPresentationTests {
    static func main() {
        testCleanupDisabledStateUsesStableCopyAndDisablesContext()
        testContextDisabledStatePreservesCleanup()
        testRecentWisprsLocalOnlyDisableAndClearState()

        print("PrivacySettingsPresentationTests passed")
    }

    private static func testCleanupDisabledStateUsesStableCopyAndDisablesContext() {
        let controls = CleanupPrivacyControls(
            cleanupEnabled: false,
            contextAwareCleanupEnabled: true
        )
        let presentation = PrivacySettingsPresentation(
            cleanupEnabled: false,
            contextAwareCleanupEnabled: true,
            recentWisprsHistoryEnabled: true,
            recentWisprCount: 0
        )

        expect(!controls.includesCleanupPayloads, "disabled cleanup should omit cleanup payloads")
        expect(!controls.includesContextPayload, "disabled cleanup should omit context payload")
        expect(!controls.effectiveContextAwareCleanupEnabled, "disabled cleanup should make context cleanup ineffective")
        expect(presentation.cleanupStatusCopy == PrivacySettingsPresentation.cleanupDisabledCopy, "cleanup disabled copy should be stable")
        expect(presentation.contextStatusCopy == PrivacySettingsPresentation.contextDisabledByCleanupCopy, "context copy should explain cleanup dependency")
        expect(!presentation.isContextToggleEnabled, "context toggle should be disabled while cleanup is off")
    }

    private static func testContextDisabledStatePreservesCleanup() {
        let controls = CleanupPrivacyControls(
            cleanupEnabled: true,
            contextAwareCleanupEnabled: false
        )
        let presentation = PrivacySettingsPresentation(
            cleanupEnabled: true,
            contextAwareCleanupEnabled: false,
            recentWisprsHistoryEnabled: true,
            recentWisprCount: 0
        )

        expect(controls.includesCleanupPayloads, "cleanup payloads should remain enabled")
        expect(!controls.includesContextPayload, "context payload should be omitted")
        expect(presentation.cleanupStatusCopy == nil, "cleanup enabled should not show disabled copy")
        expect(presentation.contextStatusCopy == PrivacySettingsPresentation.contextDisabledCopy, "context disabled copy should be stable")
        expect(presentation.isContextToggleEnabled, "context toggle should be available when cleanup is on")
    }

    private static func testRecentWisprsLocalOnlyDisableAndClearState() {
        let emptyEnabled = PrivacySettingsPresentation(
            cleanupEnabled: true,
            contextAwareCleanupEnabled: true,
            recentWisprsHistoryEnabled: true,
            recentWisprCount: 0
        )
        expect(!emptyEnabled.canClearRecentWisprs, "empty local history should disable clear")
        expect(emptyEnabled.canDisableAndClearRecentWisprs, "enabled local history can be disabled")
        expect(PrivacySettingsPresentation.recentWisprsLocalOnlyCopy.contains("local-only"), "copy should state local-only")
        expect(PrivacySettingsPresentation.recentWisprsLocalOnlyCopy.contains("never synced"), "copy should state no backend sync")

        let disabledWithItems = PrivacySettingsPresentation(
            cleanupEnabled: true,
            contextAwareCleanupEnabled: true,
            recentWisprsHistoryEnabled: false,
            recentWisprCount: 2
        )
        expect(disabledWithItems.canClearRecentWisprs, "disabled history with entries should allow clear")
        expect(disabledWithItems.canDisableAndClearRecentWisprs, "disabled history with entries should allow combined clear")
        expect(disabledWithItems.recentWisprsStatusCopy == PrivacySettingsPresentation.recentWisprsDisabledCopy, "recent wisprs disabled copy should be stable")
    }
}
