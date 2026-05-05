import Foundation

private enum TranscriptionServiceConfigurationError: Error {
    case invalidBaseURL(String)
}

enum TranscriptionService {
    static func validateAPIKey(
        _ key: String,
        baseURL: String = "https://api.groq.com/openai/v1"
    ) async -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard let baseURL = try? normalizedBaseURL(from: baseURL) else { return false }

        var request = URLRequest(url: baseURL.appendingPathComponent("models"))
        request.timeoutInterval = 10
        request.setValue("Bearer \(trimmed)", forHTTPHeaderField: "Authorization")

        do {
            let (_, response) = try await LLMAPITransport.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            return status == 200
        } catch {
            return false
        }
    }

    private static func normalizedBaseURL(from baseURL: String) throws -> URL {
        let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw TranscriptionServiceConfigurationError.invalidBaseURL("Provider URL is empty.")
        }

        guard var components = URLComponents(string: trimmed) else {
            throw TranscriptionServiceConfigurationError.invalidBaseURL("Provider URL is malformed.")
        }

        guard let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            throw TranscriptionServiceConfigurationError.invalidBaseURL("Provider URL must use http or https.")
        }

        guard let host = components.host, !host.isEmpty else {
            throw TranscriptionServiceConfigurationError.invalidBaseURL("Provider URL must include a host.")
        }

        components.scheme = scheme
        if components.path == "/" {
            components.path = ""
        } else {
            components.path = components.path.replacingOccurrences(
                of: "/+$",
                with: "",
                options: .regularExpression
            )
        }

        guard let normalizedURL = components.url else {
            throw TranscriptionServiceConfigurationError.invalidBaseURL("Provider URL is malformed.")
        }

        return normalizedURL
    }
}
