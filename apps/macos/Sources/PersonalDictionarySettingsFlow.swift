import Foundation

struct PersonalDictionarySettingsFlow: Equatable {
    static let emptyStateCopy = "Add names or terms RubyWhisper should preserve."
    static let localOnlyCopy = "Saved only on this Mac in v0.1. Dictionary terms are used for cleanup only and are not synced to RubyWhisper."
    static let disabledCopy = "Dictionary use is off. Saved terms stay local and will not be included in cleanup."

    var draftTerm = ""
    private(set) var editingTermID: String?
    private(set) var validationMessage: String?

    var isEditing: Bool {
        editingTermID != nil
    }

    var submitLabel: String {
        isEditing ? "Save Term" : "Add Term"
    }

    var cancelLabel: String {
        "Cancel Edit"
    }

    mutating func updateDraft(_ value: String) {
        draftTerm = value
        validationMessage = nil
    }

    mutating func beginEditing(_ term: PersonalDictionaryTerm) {
        editingTermID = term.id
        draftTerm = term.term
        validationMessage = nil
    }

    mutating func finishSubmit() {
        editingTermID = nil
        draftTerm = ""
        validationMessage = nil
    }

    mutating func cancelEditing() {
        editingTermID = nil
        draftTerm = ""
        validationMessage = nil
    }

    mutating func setValidationError(_ error: Error) {
        validationMessage = Self.validationMessage(for: error)
    }

    static func validationMessage(for error: Error) -> String {
        if let validationError = error as? PersonalDictionaryValidationError {
            switch validationError {
            case .empty:
                return "Enter a term to preserve."
            case .duplicate:
                return "That term is already in your dictionary."
            case .tooLong:
                return "Use \(PersonalDictionaryStore.maxTermScalarLength) characters or fewer."
            case .unsupportedCharacters:
                return "Remove unsupported control characters."
            case .punctuationOnly:
                return "Use at least one letter or number."
            case .tooManyTerms:
                return "Dictionary limit reached. Delete a term before adding another."
            }
        }
        if let storeError = error as? PersonalDictionaryStoreError {
            switch storeError {
            case .termNotFound:
                return "That term is no longer available."
            }
        }
        return "Could not save this dictionary term."
    }
}
