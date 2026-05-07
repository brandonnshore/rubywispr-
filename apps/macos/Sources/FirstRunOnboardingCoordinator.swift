import Combine
import Foundation

enum FirstRunOnboardingStep: String, Codable, CaseIterable, Equatable, Comparable, CustomStringConvertible {
    case notStarted = "not_started"
    case signInRequired = "sign_in_required"
    case signInInProgress = "sign_in_in_progress"
    case accountRefreshing = "account_refreshing"
    case termsRequired = "terms_required"
    case accountIneligible = "account_ineligible"
    case microphoneRequired = "microphone_required"
    case microphoneRequesting = "microphone_requesting"
    case microphoneRecovery = "microphone_recovery"
    case accessibilityRequired = "accessibility_required"
    case accessibilityRequesting = "accessibility_requesting"
    case accessibilityRecovery = "accessibility_recovery"
    case testWhisperRequired = "test_whisper_required"
    case testWhisperRecording = "test_whisper_recording"
    case testWhisperProcessing = "test_whisper_processing"
    case ready

    var description: String { rawValue }

    static func < (lhs: FirstRunOnboardingStep, rhs: FirstRunOnboardingStep) -> Bool {
        lhs.order < rhs.order
    }

    private var order: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }

    var allowsNormalDictation: Bool {
        self == .ready
    }
}

enum FirstRunOnboardingPermissionCategory: String, Codable, Equatable {
    case unknown
    case notDetermined = "not_determined"
    case requesting
    case granted
    case denied
    case restricted
    case unavailable

    var blocksInRecovery: Bool {
        switch self {
        case .denied, .restricted, .unavailable:
            return true
        case .unknown, .notDetermined, .requesting, .granted:
            return false
        }
    }
}

enum FirstRunOnboardingTestWhisperStatus: String, Codable, Equatable {
    case notStarted = "not_started"
    case recording
    case processing
    case succeeded
    case failed
}

enum FirstRunOnboardingAccountCategory: String, Codable, Equatable {
    case trialActive = "trial_active"
    case paidActive = "paid_active"
    case friendOfRubyActive = "friend_of_ruby_active"
}

struct FirstRunOnboardingAccountGatePresentation: Equatable {
    var title: String
    var message: String
    var statusLabel: String
    var systemImageName: String
    var primaryActionTitle: String?
    var primaryRecoveryAction: RubyWhisperDesktopRecoveryAction?
    var canContinue: Bool
    var showsProgress: Bool
}

struct FirstRunOnboardingGateSnapshot: Equatable {
    var authState: DesktopAuthCoordinatorState
    var microphoneStatus: FirstRunOnboardingPermissionCategory
    var accessibilityStatus: FirstRunOnboardingPermissionCategory
    var testWhisperStatus: FirstRunOnboardingTestWhisperStatus

    init(
        authState: DesktopAuthCoordinatorState,
        microphoneStatus: FirstRunOnboardingPermissionCategory,
        accessibilityStatus: FirstRunOnboardingPermissionCategory,
        testWhisperStatus: FirstRunOnboardingTestWhisperStatus = .notStarted
    ) {
        self.authState = authState
        self.microphoneStatus = microphoneStatus
        self.accessibilityStatus = accessibilityStatus
        self.testWhisperStatus = testWhisperStatus
    }
}

struct FirstRunOnboardingMetadata: Codable, Equatable, CustomStringConvertible {
    static let currentSchemaVersion = 1

    var schemaVersion: Int = Self.currentSchemaVersion
    var highestCompletedStep: FirstRunOnboardingStep?
    var completedStepRawValues: [String] = []
    var onboardingCompletedAt: Date?
    var completedAppVersion: String?
    var completedAppBuild: String?
    var lastAccountCategory: FirstRunOnboardingAccountCategory?
    var lastMicrophoneStatus: FirstRunOnboardingPermissionCategory?
    var lastMicrophoneCheckedAt: Date?
    var lastAccessibilityStatus: FirstRunOnboardingPermissionCategory?
    var lastAccessibilityCheckedAt: Date?
    var testWhisperCompleted: Bool = false
    var testWhisperCompletedAt: Date?
    var testWhisperOutcomeCategory: FirstRunOnboardingTestWhisperStatus?
    var dismissedOptionalCopyRawValues: [String] = []

    var completedSteps: Set<FirstRunOnboardingStep> {
        get {
            Set(completedStepRawValues.compactMap(FirstRunOnboardingStep.init(rawValue:)))
        }
        set {
            completedStepRawValues = newValue
                .map(\.rawValue)
                .sorted()
        }
    }

    var dismissedOptionalCopyKeys: Set<String> {
        get { Set(dismissedOptionalCopyRawValues) }
        set { dismissedOptionalCopyRawValues = newValue.sorted() }
    }

    var description: String {
        [
            "schemaVersion=\(schemaVersion)",
            "highestCompletedStep=\(highestCompletedStep?.rawValue ?? "none")",
            "completedSteps=\(completedStepRawValues.joined(separator: ","))",
            "lastAccountCategory=\(lastAccountCategory?.rawValue ?? "none")",
            "lastMicrophoneStatus=\(lastMicrophoneStatus?.rawValue ?? "none")",
            "lastAccessibilityStatus=\(lastAccessibilityStatus?.rawValue ?? "none")",
            "testWhisperCompleted=\(testWhisperCompleted)",
            "testWhisperOutcomeCategory=\(testWhisperOutcomeCategory?.rawValue ?? "none")"
        ].joined(separator: " ")
    }
}

protocol FirstRunOnboardingMetadataStoring {
    func load() -> FirstRunOnboardingMetadata?
    func save(_ metadata: FirstRunOnboardingMetadata)
    func reset()
}

struct UserDefaultsFirstRunOnboardingMetadataStore: FirstRunOnboardingMetadataStoring {
    static let defaultStorageKey = "rubywhisper.firstRunOnboarding.metadata.v1"

    private let defaults: UserDefaults
    private let storageKey: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        defaults: UserDefaults = .standard,
        storageKey: String = Self.defaultStorageKey
    ) {
        self.defaults = defaults
        self.storageKey = storageKey

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func load() -> FirstRunOnboardingMetadata? {
        guard let data = defaults.data(forKey: storageKey),
              let metadata = try? decoder.decode(FirstRunOnboardingMetadata.self, from: data),
              metadata.schemaVersion == FirstRunOnboardingMetadata.currentSchemaVersion else {
            return nil
        }
        return metadata
    }

    func save(_ metadata: FirstRunOnboardingMetadata) {
        guard let data = try? encoder.encode(metadata) else { return }
        defaults.set(data, forKey: storageKey)
    }

    func reset() {
        defaults.removeObject(forKey: storageKey)
    }
}

final class FirstRunOnboardingCoordinator: ObservableObject {
    @Published private(set) var currentStep: FirstRunOnboardingStep
    @Published private(set) var metadata: FirstRunOnboardingMetadata

    private let metadataStore: FirstRunOnboardingMetadataStoring
    private let appVersionProvider: () -> String
    private let appBuildProvider: () -> String?
    private let now: () -> Date

    init(
        metadataStore: FirstRunOnboardingMetadataStoring = UserDefaultsFirstRunOnboardingMetadataStore(),
        appVersionProvider: @escaping () -> String = FirstRunOnboardingCoordinator.currentAppVersion,
        appBuildProvider: @escaping () -> String? = FirstRunOnboardingCoordinator.currentAppBuild,
        now: @escaping () -> Date = Date.init
    ) {
        self.metadataStore = metadataStore
        self.appVersionProvider = appVersionProvider
        self.appBuildProvider = appBuildProvider
        self.now = now
        self.metadata = metadataStore.load() ?? FirstRunOnboardingMetadata()
        self.currentStep = .notStarted
    }

    var canEnterReady: Bool {
        currentStep == .ready
    }

    @discardableResult
    func update(with snapshot: FirstRunOnboardingGateSnapshot) -> FirstRunOnboardingStep {
        let resolvedStep = Self.resolveStep(for: snapshot)
        currentStep = resolvedStep
        updateMetadata(for: resolvedStep, snapshot: snapshot)
        return resolvedStep
    }

    func resetForQA() {
        metadata = FirstRunOnboardingMetadata()
        currentStep = .notStarted
        metadataStore.reset()
    }

    func markOptionalCopyDismissed(_ key: String) {
        let trimmedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedKey.isEmpty else { return }
        var copyKeys = metadata.dismissedOptionalCopyKeys
        copyKeys.insert(trimmedKey)
        metadata.dismissedOptionalCopyKeys = copyKeys
        metadataStore.save(metadata)
    }

    static func canStartTestWhisper(from snapshot: FirstRunOnboardingGateSnapshot) -> Bool {
        guard accountCategory(for: snapshot.authState) != nil else {
            return false
        }
        return snapshot.microphoneStatus == .granted &&
            snapshot.accessibilityStatus == .granted
    }

    static func resolveStep(for snapshot: FirstRunOnboardingGateSnapshot) -> FirstRunOnboardingStep {
        switch snapshot.authState {
        case .signedOut, .canceled:
            return .signInRequired
        case .loginLaunching, .browserPending, .handoffPending, .sessionExchanging:
            return .signInInProgress
        case .accountRefreshing, .error, .unknown:
            return .accountRefreshing
        case .signedInTermsRequired:
            return .termsRequired
        case .trialExhausted, .paymentFailed, .blocked:
            return .accountIneligible
        case .trialActive, .paidActive, .friendOfRubyActive:
            break
        }

        switch snapshot.microphoneStatus {
        case .unknown, .notDetermined:
            return .microphoneRequired
        case .requesting:
            return .microphoneRequesting
        case .denied, .restricted, .unavailable:
            return .microphoneRecovery
        case .granted:
            break
        }

        switch snapshot.accessibilityStatus {
        case .unknown, .notDetermined:
            return .accessibilityRequired
        case .requesting:
            return .accessibilityRequesting
        case .denied, .restricted, .unavailable:
            return .accessibilityRecovery
        case .granted:
            break
        }

        switch snapshot.testWhisperStatus {
        case .notStarted, .failed:
            return .testWhisperRequired
        case .recording:
            return .testWhisperRecording
        case .processing:
            return .testWhisperProcessing
        case .succeeded:
            return .ready
        }
    }

    static func accountCategory(for authState: DesktopAuthCoordinatorState) -> FirstRunOnboardingAccountCategory? {
        switch authState {
        case .trialActive:
            return .trialActive
        case .paidActive:
            return .paidActive
        case .friendOfRubyActive:
            return .friendOfRubyActive
        case .signedOut, .loginLaunching, .browserPending, .handoffPending,
             .sessionExchanging, .accountRefreshing, .signedInTermsRequired,
             .trialExhausted, .paymentFailed, .blocked, .canceled, .error,
             .unknown:
            return nil
        }
    }

    static func accountGatePresentation(
        for authState: DesktopAuthCoordinatorState,
        recovery: RubyWhisperDesktopRecoveryAction? = nil
    ) -> FirstRunOnboardingAccountGatePresentation {
        switch authState.dictationAccountGateDecision {
        case .allowed:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Account Ready",
                message: "Your signed-in account can use RubyWhisper transcription.",
                statusLabel: authState.rawValue,
                systemImageName: "checkmark.circle.fill",
                primaryActionTitle: nil,
                primaryRecoveryAction: nil,
                canContinue: true,
                showsProgress: false
            )
        case .signInRequired:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Sign In",
                message: "Sign in with your RubyWhisper account before continuing to Mac permissions.",
                statusLabel: authState.rawValue,
                systemImageName: "person.crop.circle.badge.xmark",
                primaryActionTitle: "Sign In",
                primaryRecoveryAction: .openSignIn,
                canContinue: false,
                showsProgress: false
            )
        case .signInInProgress:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Complete Sign In",
                message: "Finish the browser sign-in flow, then return to RubyWhisper.",
                statusLabel: authState.rawValue,
                systemImageName: "arrow.triangle.2.circlepath",
                primaryActionTitle: nil,
                primaryRecoveryAction: nil,
                canContinue: false,
                showsProgress: true
            )
        case .accountRefreshing:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Loading Account",
                message: "RubyWhisper is checking account eligibility before enabling setup.",
                statusLabel: authState.rawValue,
                systemImageName: "arrow.triangle.2.circlepath",
                primaryActionTitle: "Retry",
                primaryRecoveryAction: recovery ?? .retry,
                canContinue: false,
                showsProgress: true
            )
        case .termsRequired:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Accept Terms",
                message: "Accept Terms and Privacy in your web account before dictation is enabled.",
                statusLabel: authState.rawValue,
                systemImageName: "doc.text.fill",
                primaryActionTitle: "Open Account",
                primaryRecoveryAction: recovery ?? .openTermsAcceptance,
                canContinue: false,
                showsProgress: false
            )
        case .trialExhausted:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Trial Exhausted",
                message: "Choose a plan in your account before continuing setup.",
                statusLabel: authState.rawValue,
                systemImageName: "creditcard.fill",
                primaryActionTitle: "Open Checkout",
                primaryRecoveryAction: recovery ?? .openCheckout,
                canContinue: false,
                showsProgress: false
            )
        case .paymentFailed:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Payment Needs Attention",
                message: "Update billing in your account before continuing setup.",
                statusLabel: authState.rawValue,
                systemImageName: "creditcard.trianglebadge.exclamationmark",
                primaryActionTitle: "Open Billing",
                primaryRecoveryAction: recovery ?? .openBilling,
                canContinue: false,
                showsProgress: false
            )
        case .blocked:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Account Blocked",
                message: "Open your account for recovery and support options.",
                statusLabel: authState.rawValue,
                systemImageName: "exclamationmark.triangle.fill",
                primaryActionTitle: "Open Account",
                primaryRecoveryAction: recovery ?? .openAccount,
                canContinue: false,
                showsProgress: false
            )
        case .accountUnavailable:
            return FirstRunOnboardingAccountGatePresentation(
                title: "Account Unavailable",
                message: "Sign in again, or refresh account state if the browser sign-in is already complete.",
                statusLabel: authState.rawValue,
                systemImageName: "exclamationmark.triangle.fill",
                primaryActionTitle: "Sign In",
                primaryRecoveryAction: .openSignIn,
                canContinue: false,
                showsProgress: false
            )
        }
    }

    private func updateMetadata(
        for step: FirstRunOnboardingStep,
        snapshot: FirstRunOnboardingGateSnapshot
    ) {
        let checkedAt = now()
        var nextMetadata = metadata
        nextMetadata.schemaVersion = FirstRunOnboardingMetadata.currentSchemaVersion
        nextMetadata.lastAccountCategory = Self.accountCategory(for: snapshot.authState)
        nextMetadata.lastMicrophoneStatus = snapshot.microphoneStatus
        nextMetadata.lastMicrophoneCheckedAt = checkedAt
        nextMetadata.lastAccessibilityStatus = snapshot.accessibilityStatus
        nextMetadata.lastAccessibilityCheckedAt = checkedAt

        var completedSteps = completedSteps(for: snapshot)
        if step == .ready {
            completedSteps.insert(.ready)
            nextMetadata.onboardingCompletedAt = nextMetadata.onboardingCompletedAt ?? checkedAt
            nextMetadata.completedAppVersion = appVersionProvider()
            nextMetadata.completedAppBuild = appBuildProvider()
        } else {
            nextMetadata.onboardingCompletedAt = nil
            nextMetadata.completedAppVersion = nil
            nextMetadata.completedAppBuild = nil
        }
        nextMetadata.completedSteps = completedSteps
        nextMetadata.highestCompletedStep = completedSteps.max()
        let acceptedTestWhisperCompletion = step == .ready
        nextMetadata.testWhisperCompleted = acceptedTestWhisperCompletion
        nextMetadata.testWhisperCompletedAt = acceptedTestWhisperCompletion
            ? (nextMetadata.testWhisperCompletedAt ?? checkedAt)
            : nil
        nextMetadata.testWhisperOutcomeCategory = sanitizedTestWhisperOutcome(snapshot.testWhisperStatus)

        guard nextMetadata != metadata else { return }
        metadata = nextMetadata
        metadataStore.save(nextMetadata)
    }

    private func completedSteps(for snapshot: FirstRunOnboardingGateSnapshot) -> Set<FirstRunOnboardingStep> {
        var steps: Set<FirstRunOnboardingStep> = []

        switch snapshot.authState {
        case .trialActive, .paidActive, .friendOfRubyActive:
            steps.insert(.signInRequired)
            steps.insert(.accountRefreshing)
            steps.insert(.termsRequired)
        case .signedInTermsRequired:
            steps.insert(.signInRequired)
            steps.insert(.accountRefreshing)
        case .trialExhausted, .paymentFailed, .blocked:
            steps.insert(.signInRequired)
            steps.insert(.accountRefreshing)
            steps.insert(.termsRequired)
        case .signedOut, .loginLaunching, .browserPending, .handoffPending,
             .sessionExchanging, .accountRefreshing, .canceled, .error, .unknown:
            break
        }

        guard Self.accountCategory(for: snapshot.authState) != nil else {
            return steps
        }

        if snapshot.microphoneStatus == .granted {
            steps.insert(.microphoneRequired)
        }

        guard snapshot.microphoneStatus == .granted else {
            return steps
        }

        if snapshot.accessibilityStatus == .granted {
            steps.insert(.accessibilityRequired)
        }

        guard snapshot.accessibilityStatus == .granted else {
            return steps
        }

        if snapshot.testWhisperStatus == .succeeded {
            steps.insert(.testWhisperRequired)
        }

        return steps
    }

    private func sanitizedTestWhisperOutcome(
        _ status: FirstRunOnboardingTestWhisperStatus
    ) -> FirstRunOnboardingTestWhisperStatus? {
        switch status {
        case .notStarted:
            return nil
        case .recording, .processing, .succeeded, .failed:
            return status
        }
    }

    private static func currentAppVersion() -> String {
        let bundle = Bundle.main
        let shortVersion = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return nonBlank(shortVersion) ?? "0.1.0"
    }

    private static func currentAppBuild() -> String? {
        let buildVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return nonBlank(buildVersion)
    }

    private static func nonBlank(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed?.isEmpty == false ? trimmed : nil
    }
}
