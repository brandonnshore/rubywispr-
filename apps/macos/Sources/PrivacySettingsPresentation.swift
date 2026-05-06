import Foundation

struct CleanupPrivacyControls: Equatable {
    var cleanupEnabled: Bool
    var contextAwareCleanupEnabled: Bool

    static let enabled = CleanupPrivacyControls(
        cleanupEnabled: true,
        contextAwareCleanupEnabled: true
    )

    var effectiveContextAwareCleanupEnabled: Bool {
        cleanupEnabled && contextAwareCleanupEnabled
    }

    var includesCleanupPayloads: Bool {
        cleanupEnabled
    }

    var includesContextPayload: Bool {
        cleanupEnabled && contextAwareCleanupEnabled
    }
}

struct PrivacySettingsPresentation: Equatable {
    let cleanupEnabled: Bool
    let contextAwareCleanupEnabled: Bool
    let recentWisprsHistoryEnabled: Bool
    let recentWisprCount: Int

    static let cleanupCopy = "When cleanup is off, RubyWhisper sends audio for transcription without cleanup context or dictionary terms."
    static let cleanupDisabledCopy = "Cleanup is off. Context and dictionary payloads are omitted from transcription uploads."
    static let contextCopy = "When context-aware cleanup is off, app context and screenshots are not included with cleanup requests."
    static let contextDisabledByCleanupCopy = "Turn cleanup on to use context-aware cleanup."
    static let contextDisabledCopy = "Context-aware cleanup is off. Cleanup can still use your local dictionary when enabled."
    static let recentWisprsLocalOnlyCopy = "Recent Wisprs are local-only on this Mac, never synced to RubyWhisper backend or Supabase, and expire after 7 days."
    static let recentWisprsDisabledCopy = "Recent Wisprs history is off. New completed Wisprs will not be saved locally."
    static let recentWisprsClearCopy = "Clear removes saved local Recent Wisprs immediately without changing account, dictionary, or backend state."

    var cleanupStatusCopy: String? {
        cleanupEnabled ? nil : Self.cleanupDisabledCopy
    }

    var contextStatusCopy: String? {
        if !cleanupEnabled {
            return Self.contextDisabledByCleanupCopy
        }
        return contextAwareCleanupEnabled ? nil : Self.contextDisabledCopy
    }

    var isContextToggleEnabled: Bool {
        cleanupEnabled
    }

    var canClearRecentWisprs: Bool {
        recentWisprCount > 0
    }

    var canDisableAndClearRecentWisprs: Bool {
        recentWisprsHistoryEnabled || recentWisprCount > 0
    }

    var recentWisprsStatusCopy: String? {
        recentWisprsHistoryEnabled ? nil : Self.recentWisprsDisabledCopy
    }
}
