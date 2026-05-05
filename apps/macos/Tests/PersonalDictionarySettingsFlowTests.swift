import Foundation

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

private final class FixtureIDs {
    private var counter = 0

    func next() -> String {
        counter += 1
        return String(format: "term_id_%03d", counter)
    }
}

private final class FixtureClock {
    private var timestamp: TimeInterval = 1_800_000_000

    func next() -> Date {
        defer { timestamp += 60 }
        return Date(timeIntervalSince1970: timestamp)
    }
}

private func makeDefaults(_ suffix: String) -> UserDefaults {
    let suiteName = "com.rubywhisper.personal-dictionary-settings.tests.\(suffix).\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
        FileHandle.standardError.write(Data("FAIL: could not create test defaults\n".utf8))
        exit(1)
    }
    defaults.removePersistentDomain(forName: suiteName)
    return defaults
}

private func makeStore(defaults: UserDefaults) -> PersonalDictionaryStore {
    let ids = FixtureIDs()
    let clock = FixtureClock()
    return PersonalDictionaryStore(
        persistence: defaults,
        storageKey: "personal_dictionary_settings_test",
        legacyVocabularyKey: "custom_vocabulary_settings_test",
        idProvider: { ids.next() },
        dateProvider: { clock.next() }
    )
}

@main
private struct PersonalDictionarySettingsFlowTests {
    static func main() throws {
        try testSettingsCopy()
        try testAddEditDeleteFlow()
        try testValidationMessagesDoNotEchoTerms()
        try testDisabledStateKeepsTermsOutOfCleanupPayload()

        print("PersonalDictionarySettingsFlowTests passed")
    }

    private static func testSettingsCopy() throws {
        expect(
            PersonalDictionarySettingsFlow.emptyStateCopy == "Add names or terms RubyWhisper should preserve.",
            "empty state copy should match approved wording"
        )
        expect(
            PersonalDictionarySettingsFlow.localOnlyCopy.contains("Saved only on this Mac in v0.1"),
            "privacy copy should make v0.1 local-only storage clear"
        )
    }

    private static func testAddEditDeleteFlow() throws {
        let store = makeStore(defaults: makeDefaults("flow"))
        var flow = PersonalDictionarySettingsFlow()

        flow.updateDraft("  term_placeholder_alpha  ")
        let added = try store.addTerm(flow.draftTerm)
        flow.finishSubmit()
        expect(flow.draftTerm.isEmpty, "successful add should clear the draft")
        expect(store.listTerms().map(\.term) == ["term_placeholder_alpha"], "add should persist through the local store")

        flow.beginEditing(added)
        expect(flow.isEditing, "begin editing should enter edit mode")
        expect(flow.draftTerm == "term_placeholder_alpha", "begin editing should load the saved term")

        flow.updateDraft("term_placeholder_beta")
        _ = try store.editTerm(id: flow.editingTermID ?? "", rawTerm: flow.draftTerm)
        flow.finishSubmit()
        expect(!flow.isEditing, "successful edit should leave edit mode")
        expect(store.listTerms().map(\.term) == ["term_placeholder_beta"], "edit should update the local term")

        try store.deleteTerm(id: added.id)
        expect(store.listTerms().isEmpty, "delete should remove the local term")
    }

    private static func testValidationMessagesDoNotEchoTerms() throws {
        let store = makeStore(defaults: makeDefaults("validation"))
        let privateTerm = "term_placeholder_private"
        _ = try store.addTerm(privateTerm)

        var flow = PersonalDictionarySettingsFlow()
        flow.updateDraft("TERM_PLACEHOLDER_PRIVATE")
        do {
            _ = try store.addTerm(flow.draftTerm)
            expect(false, "duplicate should fail validation")
        } catch {
            flow.setValidationError(error)
        }

        let validationMessage = flow.validationMessage ?? ""
        expect(validationMessage == "That term is already in your dictionary.", "duplicate message should be generic")
        expect(!validationMessage.contains(privateTerm), "validation message should not echo private term content")
        expect(!validationMessage.contains(flow.draftTerm), "validation message should not echo draft term content")
    }

    private static func testDisabledStateKeepsTermsOutOfCleanupPayload() throws {
        let store = makeStore(defaults: makeDefaults("disabled"))
        _ = try store.addTerm("term_placeholder_alpha")

        store.setEnabled(false)
        expect(store.listTerms().map(\.term) == ["term_placeholder_alpha"], "disabled state should keep local records")
        expect(store.termsForCleanupPayload().isEmpty, "disabled state should omit cleanup payload terms")
        expect(
            PersonalDictionarySettingsFlow.disabledCopy.contains("will not be included in cleanup"),
            "disabled copy should explain cleanup omission"
        )
    }
}
