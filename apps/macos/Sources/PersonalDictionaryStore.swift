import Foundation

struct PersonalDictionaryTerm: Codable, Equatable, Identifiable {
    let id: String
    var term: String
    let createdAt: Date
    var updatedAt: Date
}

struct PersonalDictionarySnapshot: Codable, Equatable {
    var isEnabled: Bool
    var terms: [PersonalDictionaryTerm]

    static let empty = PersonalDictionarySnapshot(isEnabled: true, terms: [])
}

enum PersonalDictionaryValidationError: String, Error, Equatable, LocalizedError, CustomStringConvertible {
    case empty
    case duplicate
    case tooLong
    case unsupportedCharacters
    case punctuationOnly
    case tooManyTerms

    var description: String {
        rawValue
    }

    var errorDescription: String? {
        switch self {
        case .empty:
            return "Dictionary term is empty."
        case .duplicate:
            return "Dictionary term already exists."
        case .tooLong:
            return "Dictionary term is too long."
        case .unsupportedCharacters:
            return "Dictionary term contains unsupported characters."
        case .punctuationOnly:
            return "Dictionary term needs letters or numbers."
        case .tooManyTerms:
            return "Dictionary term limit reached."
        }
    }
}

enum PersonalDictionaryStoreError: String, Error, Equatable, LocalizedError, CustomStringConvertible {
    case termNotFound

    var description: String {
        rawValue
    }

    var errorDescription: String? {
        switch self {
        case .termNotFound:
            return "Dictionary term was not found."
        }
    }
}

protocol PersonalDictionaryPersistence {
    func data(forKey defaultName: String) -> Data?
    func string(forKey defaultName: String) -> String?
    func set(_ value: Any?, forKey defaultName: String)
    func removeObject(forKey defaultName: String)
}

extension UserDefaults: PersonalDictionaryPersistence {}

final class PersonalDictionaryStore {
    static let defaultStorageKey = "personal_dictionary"
    static let legacyCustomVocabularyKey = "custom_vocabulary"
    static let maxActiveTerms = 250
    static let maxTermScalarLength = 80
    static let cleanupPayloadTermLimit = 100
    static let cleanupPayloadByteLimit = 8 * 1024

    private let persistence: PersonalDictionaryPersistence
    private let storageKey: String
    private let legacyVocabularyKey: String?
    private let idProvider: () -> String
    private let dateProvider: () -> Date
    private var snapshot: PersonalDictionarySnapshot

    init(
        persistence: PersonalDictionaryPersistence = UserDefaults.standard,
        storageKey: String = PersonalDictionaryStore.defaultStorageKey,
        legacyVocabularyKey: String? = PersonalDictionaryStore.legacyCustomVocabularyKey,
        idProvider: @escaping () -> String = { UUID().uuidString },
        dateProvider: @escaping () -> Date = { Date() }
    ) {
        self.persistence = persistence
        self.storageKey = storageKey
        self.legacyVocabularyKey = legacyVocabularyKey
        self.idProvider = idProvider
        self.dateProvider = dateProvider
        self.snapshot = Self.loadSnapshot(
            from: persistence,
            storageKey: storageKey,
            legacyVocabularyKey: legacyVocabularyKey,
            idProvider: idProvider,
            dateProvider: dateProvider
        )
    }

    var isEnabled: Bool {
        snapshot.isEnabled
    }

    func listTerms() -> [PersonalDictionaryTerm] {
        sortedTerms(snapshot.terms)
    }

    @discardableResult
    func addTerm(_ rawTerm: String) throws -> PersonalDictionaryTerm {
        let normalizedTerm = try Self.validate(
            rawTerm,
            existingTerms: snapshot.terms,
            replacingTermID: nil
        )
        guard snapshot.terms.count < Self.maxActiveTerms else {
            throw PersonalDictionaryValidationError.tooManyTerms
        }

        let now = dateProvider()
        let record = PersonalDictionaryTerm(
            id: idProvider(),
            term: normalizedTerm,
            createdAt: now,
            updatedAt: now
        )
        snapshot.terms.append(record)
        persist()
        return record
    }

    @discardableResult
    func editTerm(id: String, rawTerm: String) throws -> PersonalDictionaryTerm {
        guard let index = snapshot.terms.firstIndex(where: { $0.id == id }) else {
            throw PersonalDictionaryStoreError.termNotFound
        }
        let normalizedTerm = try Self.validate(
            rawTerm,
            existingTerms: snapshot.terms,
            replacingTermID: id
        )
        snapshot.terms[index].term = normalizedTerm
        snapshot.terms[index].updatedAt = dateProvider()
        persist()
        return snapshot.terms[index]
    }

    func deleteTerm(id: String) throws {
        guard let index = snapshot.terms.firstIndex(where: { $0.id == id }) else {
            throw PersonalDictionaryStoreError.termNotFound
        }
        snapshot.terms.remove(at: index)
        persist()
    }

    func setEnabled(_ enabled: Bool) {
        snapshot.isEnabled = enabled
        persist()
    }

    func termsForCleanupPayload() -> [String] {
        guard snapshot.isEnabled else { return [] }

        var terms: [String] = []
        for record in sortedTerms(snapshot.terms).prefix(Self.cleanupPayloadTermLimit) {
            let candidate = terms + [record.term]
            guard Self.serializedByteCount(candidate) <= Self.cleanupPayloadByteLimit else {
                break
            }
            terms = candidate
        }
        return terms
    }

    private func persist() {
        guard let data = try? JSONEncoder.rubyWhisperPersonalDictionary.encode(snapshot) else {
            return
        }
        persistence.set(data, forKey: storageKey)
    }

    private static func loadSnapshot(
        from persistence: PersonalDictionaryPersistence,
        storageKey: String,
        legacyVocabularyKey: String?,
        idProvider: () -> String,
        dateProvider: () -> Date
    ) -> PersonalDictionarySnapshot {
        if let data = persistence.data(forKey: storageKey),
           let decoded = try? JSONDecoder.rubyWhisperPersonalDictionary.decode(
            PersonalDictionarySnapshot.self,
            from: data
           ) {
            let sanitized = sanitizedSnapshot(decoded)
            if sanitized != decoded,
               let data = try? JSONEncoder.rubyWhisperPersonalDictionary.encode(sanitized) {
                persistence.set(data, forKey: storageKey)
            }
            return sanitized
        }

        if let legacyVocabularyKey,
           let legacyVocabulary = persistence.string(forKey: legacyVocabularyKey),
           !legacyVocabulary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let migrated = migrateLegacyVocabulary(
                legacyVocabulary,
                idProvider: idProvider,
                dateProvider: dateProvider
            )
            if let data = try? JSONEncoder.rubyWhisperPersonalDictionary.encode(migrated) {
                persistence.set(data, forKey: storageKey)
                persistence.removeObject(forKey: legacyVocabularyKey)
            }
            return migrated
        }

        persistence.removeObject(forKey: storageKey)
        return .empty
    }

    private static func migrateLegacyVocabulary(
        _ rawVocabulary: String,
        idProvider: () -> String,
        dateProvider: () -> Date
    ) -> PersonalDictionarySnapshot {
        var terms: [PersonalDictionaryTerm] = []
        for rawTerm in rawVocabulary.split(whereSeparator: { $0 == "\n" || $0 == "," || $0 == ";" }) {
            guard terms.count < maxActiveTerms,
                  let normalized = try? validate(
                    String(rawTerm),
                    existingTerms: terms,
                    replacingTermID: nil
                  ) else {
                continue
            }
            let now = dateProvider()
            terms.append(PersonalDictionaryTerm(
                id: idProvider(),
                term: normalized,
                createdAt: now,
                updatedAt: now
            ))
        }
        return PersonalDictionarySnapshot(isEnabled: true, terms: terms)
    }

    private static func sanitizedSnapshot(_ snapshot: PersonalDictionarySnapshot) -> PersonalDictionarySnapshot {
        var terms: [PersonalDictionaryTerm] = []
        for record in snapshot.terms {
            guard !record.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  terms.count < maxActiveTerms,
                  let normalized = try? validate(
                    record.term,
                    existingTerms: terms,
                    replacingTermID: nil
                  ) else {
                continue
            }
            terms.append(PersonalDictionaryTerm(
                id: record.id,
                term: normalized,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt
            ))
        }
        return PersonalDictionarySnapshot(isEnabled: snapshot.isEnabled, terms: terms)
    }

    static func validate(
        _ rawTerm: String,
        existingTerms: [PersonalDictionaryTerm],
        replacingTermID: String?
    ) throws -> String {
        let trimmed = rawTerm.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw PersonalDictionaryValidationError.empty
        }
        guard !containsUnsupportedScalars(trimmed) else {
            throw PersonalDictionaryValidationError.unsupportedCharacters
        }

        let normalized = collapseWhitespace(in: trimmed)
        guard !normalized.isEmpty else {
            throw PersonalDictionaryValidationError.empty
        }
        guard normalized.unicodeScalars.count <= maxTermScalarLength else {
            throw PersonalDictionaryValidationError.tooLong
        }
        guard containsContentScalar(normalized) else {
            throw PersonalDictionaryValidationError.punctuationOnly
        }

        let normalizedComparisonKey = comparisonKey(normalized)
        let isDuplicate = existingTerms.contains { record in
            record.id != replacingTermID && comparisonKey(record.term) == normalizedComparisonKey
        }
        guard !isDuplicate else {
            throw PersonalDictionaryValidationError.duplicate
        }

        return normalized
    }

    private func sortedTerms(_ terms: [PersonalDictionaryTerm]) -> [PersonalDictionaryTerm] {
        terms.sorted {
            if $0.createdAt == $1.createdAt {
                return $0.id < $1.id
            }
            return $0.createdAt < $1.createdAt
        }
    }

    private static func collapseWhitespace(in value: String) -> String {
        var output = ""
        var previousWasWhitespace = false

        for scalar in value.unicodeScalars {
            if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                if !previousWasWhitespace {
                    output.append(" ")
                }
                previousWasWhitespace = true
            } else {
                output.unicodeScalars.append(scalar)
                previousWasWhitespace = false
            }
        }

        return output
    }

    private static func containsUnsupportedScalars(_ value: String) -> Bool {
        value.unicodeScalars.contains { scalar in
            scalar.value == 0 || scalar.properties.generalCategory == .control
        }
    }

    private static func containsContentScalar(_ value: String) -> Bool {
        value.unicodeScalars.contains { scalar in
            switch scalar.properties.generalCategory {
            case .spaceSeparator,
                 .lineSeparator,
                 .paragraphSeparator,
                 .dashPunctuation,
                 .openPunctuation,
                 .closePunctuation,
                 .initialPunctuation,
                 .finalPunctuation,
                 .connectorPunctuation,
                 .otherPunctuation,
                 .mathSymbol,
                 .currencySymbol,
                 .modifierSymbol,
                 .otherSymbol:
                return false
            default:
                return true
            }
        }
    }

    private static func comparisonKey(_ value: String) -> String {
        collapseWhitespace(in: value.trimmingCharacters(in: .whitespacesAndNewlines)).lowercased()
    }

    private static func serializedByteCount(_ terms: [String]) -> Int {
        (try? JSONSerialization.data(withJSONObject: terms, options: []).count) ?? Int.max
    }
}

private extension JSONEncoder {
    static var rubyWhisperPersonalDictionary: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

private extension JSONDecoder {
    static var rubyWhisperPersonalDictionary: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
