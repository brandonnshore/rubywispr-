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
    let suiteName = "com.rubywhisper.personal-dictionary.tests.\(suffix).\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
        FileHandle.standardError.write(Data("FAIL: could not create test defaults\n".utf8))
        exit(1)
    }
    defaults.removePersistentDomain(forName: suiteName)
    return defaults
}

private func makeStore(
    defaults: UserDefaults,
    ids: FixtureIDs = FixtureIDs(),
    clock: FixtureClock = FixtureClock()
) -> PersonalDictionaryStore {
    PersonalDictionaryStore(
        persistence: defaults,
        storageKey: "personal_dictionary_test",
        legacyVocabularyKey: "custom_vocabulary_test",
        idProvider: { ids.next() },
        dateProvider: { clock.next() }
    )
}

private func expectValidationError(
    _ expectedError: PersonalDictionaryValidationError,
    privateTerm: String,
    operation: () throws -> Void
) {
    do {
        try operation()
        expect(false, "validation should fail with \(expectedError)")
    } catch let error as PersonalDictionaryValidationError {
        expect(error == expectedError, "validation should fail with \(expectedError)")
        let rendered = [
            String(describing: error),
            error.localizedDescription,
            error.errorDescription ?? "",
        ].joined(separator: " ")
        expect(!rendered.contains(privateTerm), "validation error must not echo term content")
    } catch {
        expect(false, "unexpected validation error type: \(error)")
    }
}

@main
private struct PersonalDictionaryStoreTests {
    static func main() throws {
        try testDefaultState()
        try testCorruptedStateDefaultsClosed()
        try testAddNormalizeAndReload()
        try testEditDeleteAndDuplicateValidation()
        try testCategoricalValidationErrors()
        try testGlobalDisableAndCleanupPayloadLimits()
        try testLegacyMigration()

        print("PersonalDictionaryStoreTests passed")
    }

    private static func testDefaultState() throws {
        let store = makeStore(defaults: makeDefaults("default"))

        expect(store.isEnabled, "dictionary should default to enabled")
        expect(store.listTerms().isEmpty, "dictionary should default to no records")
        expect(store.termsForCleanupPayload().isEmpty, "empty dictionary should not shape payload terms")
    }

    private static func testCorruptedStateDefaultsClosed() throws {
        let defaults = makeDefaults("corrupted")
        defaults.set(Data("not-json".utf8), forKey: "personal_dictionary_test")

        let store = makeStore(defaults: defaults)
        expect(store.isEnabled, "corrupted dictionary state should default to enabled")
        expect(store.listTerms().isEmpty, "corrupted dictionary state should fail closed to empty")
        expect(defaults.data(forKey: "personal_dictionary_test") == nil, "corrupted dictionary state should be cleared")
    }

    private static func testAddNormalizeAndReload() throws {
        let defaults = makeDefaults("reload")
        let ids = FixtureIDs()
        let clock = FixtureClock()
        let store = makeStore(defaults: defaults, ids: ids, clock: clock)

        let first = try store.addTerm("  term_placeholder_alpha   beta  ")
        expect(first.id == "term_id_001", "new record should use provided local id")
        expect(first.term == "term_placeholder_alpha beta", "add should normalize whitespace")
        expect(first.createdAt == first.updatedAt, "new record timestamps should match")

        let reloaded = makeStore(defaults: defaults, ids: ids, clock: clock)
        let terms = reloaded.listTerms()
        expect(terms == [first], "records should persist across store reloads")
        expect(reloaded.termsForCleanupPayload() == ["term_placeholder_alpha beta"], "cleanup seam should expose saved terms")
    }

    private static func testEditDeleteAndDuplicateValidation() throws {
        let store = makeStore(defaults: makeDefaults("edit-delete"))
        let first = try store.addTerm("term_placeholder_alpha")
        let second = try store.addTerm("term_placeholder_beta")

        let edited = try store.editTerm(id: first.id, rawTerm: "  TERM_placeholder_alpha  edited  ")
        expect(edited.id == first.id, "edit should preserve record id")
        expect(edited.createdAt == first.createdAt, "edit should preserve creation timestamp")
        expect(edited.updatedAt > first.updatedAt, "edit should update modified timestamp")
        expect(edited.term == "TERM_placeholder_alpha edited", "edit should normalize and preserve casing")

        expectValidationError(.duplicate, privateTerm: "term_placeholder_beta") {
            _ = try store.editTerm(id: first.id, rawTerm: "TERM_PLACEHOLDER_BETA")
        }

        try store.deleteTerm(id: second.id)
        let remainingTerms = store.listTerms().map(\.term)
        expect(remainingTerms == ["TERM_placeholder_alpha edited"], "delete should remove local record")
        expect(!store.termsForCleanupPayload().contains("term_placeholder_beta"), "deleted term should stay out of cleanup seam")
    }

    private static func testCategoricalValidationErrors() throws {
        let store = makeStore(defaults: makeDefaults("validation"))
        _ = try store.addTerm("term_placeholder_alpha")

        expectValidationError(.empty, privateTerm: "") {
            _ = try store.addTerm("   ")
        }
        expectValidationError(.duplicate, privateTerm: "TERM_PLACEHOLDER_ALPHA") {
            _ = try store.addTerm("TERM_PLACEHOLDER_ALPHA")
        }
        expectValidationError(.tooLong, privateTerm: String(repeating: "a", count: 81)) {
            _ = try store.addTerm(String(repeating: "a", count: 81))
        }
        expectValidationError(.unsupportedCharacters, privateTerm: "term_placeholder_alpha\u{0000}") {
            _ = try store.addTerm("term_placeholder_alpha\u{0000}")
        }
        expectValidationError(.punctuationOnly, privateTerm: "!!! ---") {
            _ = try store.addTerm("!!! ---")
        }
    }

    private static func testGlobalDisableAndCleanupPayloadLimits() throws {
        let store = makeStore(defaults: makeDefaults("payload-limits"))

        for index in 1...105 {
            _ = try store.addTerm(String(format: "term_placeholder_%03d", index))
        }
        let enabledTerms = store.termsForCleanupPayload()
        expect(enabledTerms.count == PersonalDictionaryStore.cleanupPayloadTermLimit, "payload seam should cap term count")
        expect(enabledTerms.first == "term_placeholder_001", "payload seam should be deterministic")
        expect(enabledTerms.last == "term_placeholder_100", "payload seam should preserve deterministic subset")

        let payloadBytes = try JSONSerialization.data(withJSONObject: enabledTerms, options: []).count
        expect(payloadBytes <= PersonalDictionaryStore.cleanupPayloadByteLimit, "payload seam should cap serialized bytes")

        store.setEnabled(false)
        expect(!store.isEnabled, "global disable should update local state")
        expect(store.termsForCleanupPayload().isEmpty, "disabled dictionary should not expose cleanup terms")

        store.setEnabled(true)
        expect(store.termsForCleanupPayload().count == PersonalDictionaryStore.cleanupPayloadTermLimit, "reenable should preserve local records")
    }

    private static func testLegacyMigration() throws {
        let defaults = makeDefaults("migration")
        defaults.set(
            "term_placeholder_alpha, TERM_PLACEHOLDER_ALPHA; !!! ; term_placeholder_beta",
            forKey: "custom_vocabulary_test"
        )

        let store = makeStore(defaults: defaults)
        expect(
            store.listTerms().map(\.term) == ["term_placeholder_alpha", "term_placeholder_beta"],
            "migration should import valid unique legacy terms"
        )
        expect(defaults.string(forKey: "custom_vocabulary_test") == nil, "migration should remove legacy term copy")

        let reloaded = makeStore(defaults: defaults)
        expect(
            reloaded.listTerms().map(\.term) == ["term_placeholder_alpha", "term_placeholder_beta"],
            "migrated terms should persist in structured store"
        )
    }
}
