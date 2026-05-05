import Foundation
import Security

struct DesktopSessionMaterial: Codable, Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date?
    var accountID: String?

    var description: String {
        "DesktopSessionMaterial(accessToken: <redacted>, refreshToken: <redacted>, expiresAt: \(String(describing: expiresAt)), accountID: <redacted>)"
    }

    var debugDescription: String {
        description
    }
}

protocol DesktopSessionStoring {
    func read() -> DesktopSessionMaterial?
    func save(_ session: DesktopSessionMaterial) throws
    func replace(with session: DesktopSessionMaterial) throws
    func delete() throws
}

enum DesktopSessionStoreError: Error, Equatable {
    case encodingFailed
    case keychainWriteFailed(operation: String, status: OSStatus)
}

struct DesktopSessionKeychainStore: DesktopSessionStoring {
    static let defaultService = "com.rubywhisper.desktop.session"
    static let defaultAccount = "primary"

    private let service: String
    private let account: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        service: String = Self.defaultService,
        account: String = Self.defaultAccount
    ) {
        self.service = service
        self.account = account

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func read() -> DesktopSessionMaterial? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching(readQuery() as CFDictionary, &result)

        guard status == errSecSuccess else {
            return nil
        }

        guard let data = result as? Data,
              let session = try? decoder.decode(DesktopSessionMaterial.self, from: data),
              !session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            try? delete()
            return nil
        }

        return session
    }

    func save(_ session: DesktopSessionMaterial) throws {
        try replace(with: session)
    }

    func replace(with session: DesktopSessionMaterial) throws {
        let data = try encodedSession(session)
        var attributes = baseQuery()
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let addStatus = SecItemAdd(attributes as CFDictionary, nil)
        if addStatus == errSecSuccess {
            return
        }

        guard addStatus == errSecDuplicateItem else {
            throw DesktopSessionStoreError.keychainWriteFailed(operation: "add", status: addStatus)
        }

        let updateStatus = SecItemUpdate(
            baseQuery() as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        guard updateStatus == errSecSuccess else {
            throw DesktopSessionStoreError.keychainWriteFailed(operation: "update", status: updateStatus)
        }
    }

    func delete() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw DesktopSessionStoreError.keychainWriteFailed(operation: "delete", status: status)
        }
    }

    private func encodedSession(_ session: DesktopSessionMaterial) throws -> Data {
        let trimmedAccessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAccessToken.isEmpty else {
            throw DesktopSessionStoreError.encodingFailed
        }

        let trimmedRefreshToken = session.refreshToken?.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedAccountID = session.accountID?.trimmingCharacters(in: .whitespacesAndNewlines)

        let normalized = DesktopSessionMaterial(
            accessToken: trimmedAccessToken,
            refreshToken: trimmedRefreshToken?.isEmpty == true ? nil : trimmedRefreshToken,
            expiresAt: session.expiresAt,
            accountID: trimmedAccountID?.isEmpty == true ? nil : trimmedAccountID
        )
        return try encoder.encode(normalized)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    private func readQuery() -> [String: Any] {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        return query
    }
}
