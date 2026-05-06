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

private struct SourceMatch {
    var path: String
    var line: Int
    var reason: String
}

@main
private struct SourceGuardrailTests {
    static func main() throws {
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let files = try sourceFiles(under: root)
        var failures: [SourceMatch] = []

        for file in files {
            let relativePath = file.path.replacingOccurrences(of: root.path + "/", with: "")
            if relativePath == "Tests/SourceGuardrailTests.swift" {
                continue
            }

            let text = try String(contentsOf: file, encoding: .utf8)
            failures.append(contentsOf: forbiddenProviderSecretNameMatches(in: text, path: relativePath))
            failures.append(contentsOf: secretShapedValueMatches(in: text, path: relativePath))
            failures.append(contentsOf: providerSettingsPersistenceMatches(in: text, path: relativePath))
            failures.append(contentsOf: plaintextAuthPersistenceMatches(in: text, path: relativePath))
        }

        if !failures.isEmpty {
            for failure in failures {
                FileHandle.standardError.write(
                    Data("FAIL: \(failure.path):\(failure.line): \(failure.reason)\n".utf8)
                )
            }
            exit(1)
        }

        print("SourceGuardrailTests passed")
    }

    private static func sourceFiles(under root: URL) throws -> [URL] {
        let roots = [
            root.appendingPathComponent("Sources"),
            root.appendingPathComponent("Tests"),
            root.appendingPathComponent("Resources"),
            root.appendingPathComponent("Info.plist"),
            root.appendingPathComponent("README.md"),
            root.appendingPathComponent("Makefile"),
        ]
        var files: [URL] = []

        for url in roots {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
                continue
            }

            if isDirectory.boolValue {
                let enumerator = FileManager.default.enumerator(
                    at: url,
                    includingPropertiesForKeys: nil
                )
                while let child = enumerator?.nextObject() as? URL {
                    if shouldScan(child) {
                        files.append(child)
                    }
                }
            } else if shouldScan(url) {
                files.append(url)
            }
        }

        return files.sorted { $0.path < $1.path }
    }

    private static func shouldScan(_ url: URL) -> Bool {
        let path = url.path
        return path.hasSuffix(".swift") ||
            path.hasSuffix(".plist") ||
            path.hasSuffix(".md") ||
            path.hasSuffix("Makefile")
    }

    private static func forbiddenProviderSecretNameMatches(in text: String, path: String) -> [SourceMatch] {
        let providerNames = [
            "G" + "ROQ_API_KEY",
            "S" + "TRIPE_SECRET_KEY",
            "S" + "TRIPE_WEBHOOK_SECRET",
            "S" + "UPABASE_SERVICE_ROLE",
            "S" + "UPABASE_SERVICE_ROLE_KEY",
            "C" + "LERK_SECRET",
            "C" + "LERK_SECRET_KEY",
            "C" + "LERK_WEBHOOK_SECRET",
        ]
        return lineMatches(in: text, path: path) { line in
            providerNames.contains { line.contains($0) }
                ? "provider or service secret name must not appear in the Mac app"
                : nil
        }
    }

    private static func secretShapedValueMatches(in text: String, path: String) -> [SourceMatch] {
        let prefixes = [
            "g" + "sk_[A-Za-z0-9_-]{16,}",
            "s" + "k_(live|test)_[A-Za-z0-9_-]{16,}",
            "r" + "k_(live|test)_[A-Za-z0-9_-]{16,}",
            "c" + "lerk_secret_[A-Za-z0-9_-]{16,}",
        ]
        let regex = try! NSRegularExpression(pattern: "(?i)\\b(" + prefixes.joined(separator: "|") + ")")
        return lineMatches(in: text, path: path) { line in
            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            return regex.firstMatch(in: line, range: range) == nil
                ? nil
                : "secret-shaped provider value must not appear in the Mac app"
        }
    }

    private static func providerSettingsPersistenceMatches(in text: String, path: String) -> [SourceMatch] {
        let forbiddenFragments = [
            "appsettingsstorage",
            "\".settings\"",
            "groq_api_key",
            "api_base_url",
            "transcription_api_key",
            "transcription_api_url",
            "advanced provider settings",
            "openai-compatible provider",
            "console.groq.com/keys",
            "paste your api key",
            "enter your groq api key",
            "api key required to test",
            "stream audio while recording (realtime)",
            "realtimetranscriptionservice",
        ]

        return lineMatches(in: text, path: path) { line in
            let lowercased = line.lowercased()
            return forbiddenFragments.contains { lowercased.contains($0) }
                ? "Mac app must not persist or request provider API secret settings"
                : nil
        }
    }

    private static func plaintextAuthPersistenceMatches(in text: String, path: String) -> [SourceMatch] {
        lineMatches(in: text, path: path) { line in
            let lowercased = line.lowercased()
            let writesPlaintextStore = lowercased.contains("userdefaults") ||
                lowercased.contains("application support")
            let mentionsAuthMaterial = lowercased.contains("token") ||
                lowercased.contains("session") ||
                lowercased.contains("authorization") ||
                lowercased.contains("bearer")

            return writesPlaintextStore && mentionsAuthMaterial
                ? "auth/session material must not be persisted outside Keychain"
                : nil
        }
    }

    private static func lineMatches(
        in text: String,
        path: String,
        matcher: (String) -> String?
    ) -> [SourceMatch] {
        var matches: [SourceMatch] = []
        for (index, line) in text.components(separatedBy: .newlines).enumerated() {
            if let reason = matcher(line) {
                matches.append(SourceMatch(path: path, line: index + 1, reason: reason))
            }
        }
        return matches
    }
}
