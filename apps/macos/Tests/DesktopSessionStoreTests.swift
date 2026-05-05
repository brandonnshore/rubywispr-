import Foundation
import Security

@discardableResult
private func expect(_ condition: @autoclosure () -> Bool, _ message: String) -> Bool {
    if condition() {
        return true
    }
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}

private func placeholderSession(_ suffix: String) -> DesktopSessionMaterial {
    DesktopSessionMaterial(
        accessToken: "session_placeholder_redacted_\(suffix)",
        refreshToken: "refresh_placeholder_redacted_\(suffix)",
        expiresAt: Date(timeIntervalSince1970: 1_800_000_000),
        accountID: "acct_test_\(suffix)"
    )
}

private func query(service: String, account: String) -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account
    ]
}

private func deleteRawItem(service: String, account: String) {
    SecItemDelete(query(service: service, account: account) as CFDictionary)
}

private func writeRawItem(_ data: Data, service: String, account: String) {
    deleteRawItem(service: service, account: account)
    var attributes = query(service: service, account: account)
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(attributes as CFDictionary, nil)
    expect(status == errSecSuccess, "raw Keychain fixture write failed with status \(status)")
}

private func itemExists(service: String, account: String) -> Bool {
    var attributes = query(service: service, account: account)
    attributes[kSecReturnData as String] = true
    attributes[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(attributes as CFDictionary, &result)
    return status == errSecSuccess
}

@main
private struct DesktopSessionStoreTests {
    static func main() throws {
        let service = "com.rubywhisper.desktop.session.tests.\(UUID().uuidString)"
        let account = "primary"
        let store = DesktopSessionKeychainStore(service: service, account: account)
        defer { try? store.delete() }

        try store.delete()
        expect(store.read() == nil, "missing Keychain item should read as signed out")

        let firstSession = placeholderSession("one")
        try store.save(firstSession)
        expect(store.read() == firstSession, "saved session should round-trip through Keychain")
        expect(!String(describing: firstSession).contains(firstSession.accessToken), "session description should redact access token")
        expect(!String(reflecting: firstSession).contains(firstSession.refreshToken!), "session debug description should redact refresh token")

        let replacementSession = placeholderSession("two")
        try store.replace(with: replacementSession)
        expect(store.read() == replacementSession, "replace should update the existing Keychain item")

        try store.delete()
        expect(store.read() == nil, "delete should clear local session state")
        expect(!itemExists(service: service, account: account), "delete should remove the Keychain item")

        writeRawItem(Data("not-json".utf8), service: service, account: account)
        expect(store.read() == nil, "corrupted Keychain item should fail closed to signed out")
        expect(!itemExists(service: service, account: account), "corrupted Keychain item should be removed")

        do {
            try store.save(DesktopSessionMaterial(accessToken: "   ", refreshToken: nil, expiresAt: nil, accountID: nil))
            expect(false, "blank access token should not be persisted")
        } catch DesktopSessionStoreError.encodingFailed {
            expect(true, "blank access token should fail encoding")
        }

        print("DesktopSessionStoreTests passed")
    }
}
