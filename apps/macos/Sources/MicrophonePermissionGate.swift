import AVFoundation
import Foundation

enum MicrophonePermissionPrimaryAction: String, Equatable {
    case none
    case requestAccess = "request_access"
    case openSystemSettings = "open_system_settings_microphone"
    case retry = "retry"
}

struct MicrophonePermissionPresentation: Equatable {
    let category: FirstRunOnboardingPermissionCategory
    let title: String
    let message: String
    let statusLabel: String
    let primaryActionTitle: String?
    let primaryAction: MicrophonePermissionPrimaryAction
    let canProceed: Bool
    let showsRecoveryPath: Bool
}

enum MicrophonePermissionGate {
    static let recoveryPath = "System Settings > Privacy & Security > Microphone > RubyWhisper"

    static func category(
        from authorizationStatus: AVAuthorizationStatus,
        hasInputDevice: Bool
    ) -> FirstRunOnboardingPermissionCategory {
        switch authorizationStatus {
        case .authorized:
            return hasInputDevice ? .granted : .unavailable
        case .notDetermined:
            return hasInputDevice ? .notDetermined : .unavailable
        case .denied:
            return .denied
        case .restricted:
            return .restricted
        @unknown default:
            return hasInputDevice ? .unknown : .unavailable
        }
    }

    static func presentation(
        for category: FirstRunOnboardingPermissionCategory
    ) -> MicrophonePermissionPresentation {
        switch category {
        case .unknown:
            return MicrophonePermissionPresentation(
                category: category,
                title: "Microphone status unavailable",
                message: "RubyWhisper could not confirm microphone access. Check again before continuing.",
                statusLabel: "Unknown",
                primaryActionTitle: "Check Again",
                primaryAction: .retry,
                canProceed: false,
                showsRecoveryPath: false
            )
        case .notDetermined:
            return MicrophonePermissionPresentation(
                category: category,
                title: "Microphone access required",
                message: "RubyWhisper needs microphone access before it can record a test whisper.",
                statusLabel: "Not Requested",
                primaryActionTitle: "Grant Access",
                primaryAction: .requestAccess,
                canProceed: false,
                showsRecoveryPath: false
            )
        case .requesting:
            return MicrophonePermissionPresentation(
                category: category,
                title: "Waiting for macOS",
                message: "Respond to the macOS microphone permission prompt to continue.",
                statusLabel: "Waiting",
                primaryActionTitle: nil,
                primaryAction: .none,
                canProceed: false,
                showsRecoveryPath: false
            )
        case .granted:
            return MicrophonePermissionPresentation(
                category: category,
                title: "Microphone access granted",
                message: "RubyWhisper can record your local test whisper.",
                statusLabel: "Granted",
                primaryActionTitle: nil,
                primaryAction: .none,
                canProceed: true,
                showsRecoveryPath: false
            )
        case .denied:
            return MicrophonePermissionPresentation(
                category: category,
                title: "Microphone access denied",
                message: "Enable RubyWhisper in macOS settings, then return here and check again.",
                statusLabel: "Denied",
                primaryActionTitle: "Open System Settings",
                primaryAction: .openSystemSettings,
                canProceed: false,
                showsRecoveryPath: true
            )
        case .restricted:
            return MicrophonePermissionPresentation(
                category: category,
                title: "Microphone access restricted",
                message: "This Mac is blocking microphone access by policy or profile. Change the policy or ask an administrator, then retry.",
                statusLabel: "Restricted",
                primaryActionTitle: "Open System Settings",
                primaryAction: .openSystemSettings,
                canProceed: false,
                showsRecoveryPath: true
            )
        case .unavailable:
            return MicrophonePermissionPresentation(
                category: category,
                title: "No microphone available",
                message: "Connect or enable a microphone input, then check again. RubyWhisper will not record until a usable microphone is available.",
                statusLabel: "Unavailable",
                primaryActionTitle: "Check Again",
                primaryAction: .retry,
                canProceed: false,
                showsRecoveryPath: false
            )
        }
    }
}
