APP_NAME ?= RubyWhisper
BUNDLE_ID ?= com.rubyadvisory.rubywhisper.local
BUILD_DIR = build
APP_BUNDLE = $(BUILD_DIR)/$(APP_NAME).app
LOCAL_CODESIGN_IDENTITY := $(shell security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/Apple Development:/ { print $$2; exit }')
CODESIGN_IDENTITY ?= $(if $(strip $(LOCAL_CODESIGN_IDENTITY)),$(LOCAL_CODESIGN_IDENTITY),-)
UPDATE_CHANNEL_ENABLED ?= false
UPDATE_RELEASES_URL ?=
RUBYWHISPER_BACKEND_BASE_URL ?= https://rubywhisper-web.vercel.app
RUBYWHISPER_BACKEND_BASE_URL := $(if $(strip $(RUBYWHISPER_BACKEND_BASE_URL)),$(RUBYWHISPER_BACKEND_BASE_URL),https://rubywhisper-web.vercel.app)
CONTENTS = $(APP_BUNDLE)/Contents
MACOS_DIR = $(CONTENTS)/MacOS
empty :=
space := $(empty) $(empty)
APP_EXECUTABLE = $(MACOS_DIR)/$(APP_NAME)
APP_EXECUTABLE_TARGET := $(subst $(space),\ ,$(APP_EXECUTABLE))

SOURCES = $(shell find Sources -name '*.swift' -type f | LC_ALL=C sort)
RESOURCES = $(CONTENTS)/Resources
THIRD_PARTY_NOTICES = Resources/ThirdPartyNotices.md
ARCH ?= $(shell uname -m)

# Pick the icon source based on which bundle we are building. Dev builds get
# a distinct badge so a developer's dock shows at a glance which RubyWhisper
# bundle they are running when both are installed side by side.
ifeq ($(APP_NAME),RubyWhisper Dev)
ICON_SOURCE = Resources/AppIcon-Dev-Source.png
ICON_ICNS = Resources/AppIcon-Dev.icns
else
ICON_SOURCE = Resources/AppIcon-Source.png
ICON_ICNS = Resources/AppIcon.icns
endif

.PHONY: all clean run dev run-dev print-signing reset-tcc reset-tcc-local reset-tcc-dev icon dmg local-dmg-preflight codesign-dmg release-signing-preflight notarize notarize-preflight test test-session-store test-backend-client test-openai-realtime-transcription-session test-auth-state-owner test-account-settings-presenter test-login-bridge test-onboarding-coordinator test-hotkey-manager test-hotkey-recording-gate test-recording-island-state-machine test-recording-island-visual-harness test-recording-duration-timer test-recording-duration-upload-gate test-live-audio-level-normalizer test-transient-recording-artifact test-dictation-timing-run test-pipeline-history-privacy test-personal-dictionary-store test-personal-dictionary-settings-flow test-privacy-settings-presentation test-appearance-settings-presentation test-recent-wispr-store test-recent-wisprs-history-menu-state test-recent-wispr-recovery-controller test-direct-insertion-coordinator test-clipboard-fallback-manager test-update-manager test-secret-guardrails

all: $(APP_EXECUTABLE_TARGET)

$(APP_EXECUTABLE_TARGET): $(SOURCES) Info.plist $(ICON_ICNS) $(THIRD_PARTY_NOTICES)
	@mkdir -p "$(MACOS_DIR)" "$(RESOURCES)"
ifeq ($(ARCH),universal)
	swiftc \
		-parse-as-library \
		-o "$(MACOS_DIR)/$(APP_NAME)-arm64" \
		-sdk $(shell xcrun --show-sdk-path) \
		-target arm64-apple-macosx13.0 \
		$(SOURCES)
	swiftc \
		-parse-as-library \
		-o "$(MACOS_DIR)/$(APP_NAME)-x86_64" \
		-sdk $(shell xcrun --show-sdk-path) \
		-target x86_64-apple-macosx13.0 \
		$(SOURCES)
	lipo -create -output "$(MACOS_DIR)/$(APP_NAME)" \
		"$(MACOS_DIR)/$(APP_NAME)-arm64" \
		"$(MACOS_DIR)/$(APP_NAME)-x86_64"
	@rm "$(MACOS_DIR)/$(APP_NAME)-arm64" "$(MACOS_DIR)/$(APP_NAME)-x86_64"
else
	swiftc \
		-parse-as-library \
		-o "$(MACOS_DIR)/$(APP_NAME)" \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		$(SOURCES)
endif
	@cp Info.plist "$(CONTENTS)/"
	@plutil -replace CFBundleName -string "$(APP_NAME)" "$(CONTENTS)/Info.plist"
	@plutil -replace CFBundleDisplayName -string "$(APP_NAME)" "$(CONTENTS)/Info.plist"
	@plutil -replace CFBundleExecutable -string "$(APP_NAME)" "$(CONTENTS)/Info.plist"
	@plutil -replace CFBundleIdentifier -string "$(BUNDLE_ID)" "$(CONTENTS)/Info.plist"
	@if [[ "$(BUNDLE_ID)" == *.local || "$(APP_NAME)" == "RubyWhisper Dev" ]]; then \
		plutil -replace LSUIElement -bool false "$(CONTENTS)/Info.plist"; \
	else \
		plutil -replace LSUIElement -bool true "$(CONTENTS)/Info.plist"; \
	fi
	@plutil -replace RubyWhisperUpdateChannelEnabled -bool "$(UPDATE_CHANNEL_ENABLED)" "$(CONTENTS)/Info.plist"
	@plutil -replace RubyWhisperUpdateReleasesURL -string "$(UPDATE_RELEASES_URL)" "$(CONTENTS)/Info.plist"
	@plutil -replace RubyWhisperBackendBaseURL -string "$(RUBYWHISPER_BACKEND_BASE_URL)" "$(CONTENTS)/Info.plist"
	@cp $(ICON_ICNS) "$(RESOURCES)/AppIcon.icns"
	@cp "$(THIRD_PARTY_NOTICES)" "$(RESOURCES)/ThirdPartyNotices.md"
	@plutil -replace NSMicrophoneUsageDescription -string "$(APP_NAME) needs microphone access to transcribe your speech." "$(CONTENTS)/Info.plist"
	@plutil -replace NSSpeechRecognitionUsageDescription -string "$(APP_NAME) needs speech recognition to convert your voice to text." "$(CONTENTS)/Info.plist"
	@plutil -replace NSAccessibilityUsageDescription -string "$(APP_NAME) needs accessibility access to detect the text cursor position and paste transcribed text." "$(CONTENTS)/Info.plist"
	@plutil -replace NSScreenCaptureUsageDescription -string "$(APP_NAME) needs screen recording access to capture the active window for context-aware transcription." "$(CONTENTS)/Info.plist"
	@echo "Signing $(APP_BUNDLE) with identity: $(CODESIGN_IDENTITY)"
	@codesign --force --options runtime --sign "$(CODESIGN_IDENTITY)" --entitlements RubyWhisper.entitlements "$(APP_BUNDLE)"
	@echo "Built $(APP_BUNDLE)"

icon: $(ICON_ICNS)

$(ICON_ICNS): $(ICON_SOURCE)
	@mkdir -p $(BUILD_DIR)/AppIcon.iconset
	@sips -z 16 16 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_16x16.png > /dev/null
	@sips -z 32 32 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_16x16@2x.png > /dev/null
	@sips -z 32 32 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_32x32.png > /dev/null
	@sips -z 64 64 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_32x32@2x.png > /dev/null
	@sips -z 128 128 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_128x128.png > /dev/null
	@sips -z 256 256 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_128x128@2x.png > /dev/null
	@sips -z 256 256 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_256x256.png > /dev/null
	@sips -z 512 512 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_256x256@2x.png > /dev/null
	@sips -z 512 512 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_512x512.png > /dev/null
	@sips -z 1024 1024 $< --out $(BUILD_DIR)/AppIcon.iconset/icon_512x512@2x.png > /dev/null
	@iconutil -c icns -o $@ $(BUILD_DIR)/AppIcon.iconset
	@rm -rf $(BUILD_DIR)/AppIcon.iconset
	@echo "Generated $@"

dmg: local-dmg-preflight all
	@rm -f "$(BUILD_DIR)/$(APP_NAME).dmg"
	@rm -rf $(BUILD_DIR)/dmg-staging
	@mkdir -p $(BUILD_DIR)/dmg-staging
	@cp -R "$(APP_BUNDLE)" $(BUILD_DIR)/dmg-staging/
	@osascript -e 'tell application "Finder" to make alias file to POSIX file "/Applications" at POSIX file "'"$$(cd $(BUILD_DIR)/dmg-staging && pwd)"'"'
	@ALIAS=$$(find $(BUILD_DIR)/dmg-staging -maxdepth 1 -not -name '*.app' -not -name '.DS_Store' -type f | head -1) && mv "$$ALIAS" "$(BUILD_DIR)/dmg-staging/Applications"
	@fileicon set "$(BUILD_DIR)/dmg-staging/Applications" /System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ApplicationsFolderIcon.icns
	@echo "Creating DMG..."
	@create-dmg \
		--volname "$(APP_NAME)" \
		--volicon "$(ICON_ICNS)" \
		--window-pos 200 120 \
		--window-size 660 400 \
		--icon-size 128 \
		--icon "$(APP_NAME).app" 180 170 \
		--hide-extension "$(APP_NAME).app" \
		--icon "Applications" 480 170 \
		--no-internet-enable \
		"$(BUILD_DIR)/$(APP_NAME).dmg" \
		"$(BUILD_DIR)/dmg-staging"
	@rm -rf $(BUILD_DIR)/dmg-staging
	@echo "Created $(BUILD_DIR)/$(APP_NAME).dmg"

local-dmg-preflight:
	@missing=""; \
	for tool in create-dmg fileicon; do \
		if ! command -v "$$tool" >/dev/null 2>&1; then \
			missing="$$missing $$tool"; \
		fi; \
	done; \
	if [ -n "$$missing" ]; then \
		echo "Local DMG packaging prerequisites missing:$$missing"; \
		echo "Install the missing non-secret tool(s), then rerun make -C apps/macos dmg CODESIGN_IDENTITY=-."; \
		echo "This target creates a local/ad hoc testing artifact only; it does not sign, notarize, upload, or publish a release."; \
		exit 2; \
	fi

codesign-dmg: release-signing-preflight dmg
	codesign --force --sign "$(CODESIGN_IDENTITY)" "$(BUILD_DIR)/$(APP_NAME).dmg"

release-signing-preflight:
	@if [ -z "$(strip $(CODESIGN_IDENTITY))" ] || [ "$(strip $(CODESIGN_IDENTITY))" = "-" ]; then \
		echo "Release signing blocked: set CODESIGN_IDENTITY to an installed Developer ID Application identity."; \
		echo "Ad hoc signing (CODESIGN_IDENTITY=-) is allowed only for local builds and local DMG testing."; \
		exit 2; \
	fi
	@case "$(strip $(CODESIGN_IDENTITY))" in \
		*"<"*|*">"*|*PLACEHOLDER*|*Placeholder*|*placeholder*|*EXAMPLE*|*Example*|*example*|*ADHOC*|*AdHoc*|*adhoc*|*"ad hoc"*|*"Ad Hoc"*) \
			echo "Release signing blocked: CODESIGN_IDENTITY must not be a placeholder or ad hoc value."; \
			exit 2; \
			;; \
	esac
	@case "$(strip $(CODESIGN_IDENTITY))" in \
		*"Developer ID Application"*) ;; \
		*) \
			echo "Release signing blocked: CODESIGN_IDENTITY must be a Developer ID Application identity."; \
			exit 2; \
			;; \
	esac
	@if ! security find-identity -v -p codesigning | grep -Fq "$(strip $(CODESIGN_IDENTITY))"; then \
		echo "Release signing blocked: the requested Developer ID Application identity is not installed in the active keychain search list."; \
		exit 2; \
	fi

notarize: release-signing-preflight notarize-preflight
	xcrun notarytool submit "$(BUILD_DIR)/$(APP_NAME).dmg" \
		--keychain-profile "$(NOTARIZE_PROFILE)" --wait
	xcrun stapler staple "$(BUILD_DIR)/$(APP_NAME).dmg"

notarize-preflight:
	@if [ -z "$(strip $(NOTARIZE_PROFILE))" ]; then \
		echo "Notarization blocked: set NOTARIZE_PROFILE to an approved notarytool keychain profile on the release machine."; \
		exit 2; \
	fi
	@case "$(strip $(NOTARIZE_PROFILE))" in \
		*"<"*|*">"*|*PLACEHOLDER*|*Placeholder*|*placeholder*|*EXAMPLE*|*Example*|*example*) \
			echo "Notarization blocked: NOTARIZE_PROFILE must not be a placeholder value."; \
			exit 2; \
			;; \
	esac
	@if ! xcrun --find notarytool >/dev/null 2>&1; then \
		echo "Notarization blocked: xcrun notarytool is unavailable."; \
		exit 2; \
	fi
	@if ! xcrun --find stapler >/dev/null 2>&1; then \
		echo "Notarization blocked: xcrun stapler is unavailable."; \
		exit 2; \
	fi
	@if [ ! -f "$(BUILD_DIR)/$(APP_NAME).dmg" ]; then \
		echo "Notarization blocked: expected $(BUILD_DIR)/$(APP_NAME).dmg to exist before submission."; \
		echo "Do not submit local ad hoc artifacts as RubyWhisper release artifacts."; \
		exit 2; \
	fi

clean:
	rm -rf $(BUILD_DIR)

run: all
	open "$(APP_BUNDLE)"

dev:
	$(MAKE) clean all APP_NAME="RubyWhisper Dev" BUNDLE_ID="com.rubyadvisory.rubywhisper.dev"

run-dev:
	$(MAKE) run APP_NAME="RubyWhisper Dev" BUNDLE_ID="com.rubyadvisory.rubywhisper.dev"

print-signing:
	@echo "APP_NAME=$(APP_NAME)"
	@echo "BUNDLE_ID=$(BUNDLE_ID)"
	@echo "Detected Apple Development identity: $(if $(strip $(LOCAL_CODESIGN_IDENTITY)),$(LOCAL_CODESIGN_IDENTITY),none)"
	@echo "CODESIGN_IDENTITY=$(CODESIGN_IDENTITY)"

reset-tcc:
	@echo "Resetting local macOS TCC rows for $(BUNDLE_ID). Reopen $(APP_NAME) and re-grant Accessibility and Screen Recording."
	@tccutil reset Accessibility "$(BUNDLE_ID)" >/dev/null 2>&1 || true
	@tccutil reset ScreenCapture "$(BUNDLE_ID)" >/dev/null 2>&1 || true

reset-tcc-local:
	@$(MAKE) reset-tcc APP_NAME="RubyWhisper" BUNDLE_ID="com.rubyadvisory.rubywhisper.local"

reset-tcc-dev:
	@$(MAKE) reset-tcc APP_NAME="RubyWhisper Dev" BUNDLE_ID="com.rubyadvisory.rubywhisper.dev"

test-session-store:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DesktopSessionStoreTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Tests/DesktopSessionStoreTests.swift
	$(BUILD_DIR)/tests/DesktopSessionStoreTests

test-backend-client:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RubyWhisperBackendAPIClientTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Tests/RubyWhisperBackendAPIClientTests.swift
	$(BUILD_DIR)/tests/RubyWhisperBackendAPIClientTests

test-openai-realtime-transcription-session:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/OpenAIRealtimeTranscriptionSessionTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/OpenAIRealtimeTranscriptionSession.swift \
		Tests/OpenAIRealtimeTranscriptionSessionTests.swift
	$(BUILD_DIR)/tests/OpenAIRealtimeTranscriptionSessionTests

test-auth-state-owner:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DesktopAuthStateOwnerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopLoginBridge.swift \
		Sources/DesktopAuthStateOwner.swift \
		Tests/DesktopAuthStateOwnerTests.swift
	$(BUILD_DIR)/tests/DesktopAuthStateOwnerTests

test-account-settings-presenter:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/AccountSettingsPresenterTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopLoginBridge.swift \
		Sources/DesktopAuthStateOwner.swift \
		Sources/AccountSettingsPresenter.swift \
		Tests/AccountSettingsPresenterTests.swift
	$(BUILD_DIR)/tests/AccountSettingsPresenterTests

test-login-bridge:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DesktopLoginBridgeTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopAuthStateOwner.swift \
		Sources/DesktopLoginBridge.swift \
		Tests/DesktopLoginBridgeTests.swift
	$(BUILD_DIR)/tests/DesktopLoginBridgeTests

test-onboarding-coordinator:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/FirstRunOnboardingCoordinatorTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopAuthStateOwner.swift \
		Sources/MicrophonePermissionGate.swift \
		Sources/FirstRunOnboardingCoordinator.swift \
		Tests/FirstRunOnboardingCoordinatorTests.swift
	$(BUILD_DIR)/tests/FirstRunOnboardingCoordinatorTests

test-hotkey-manager:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/HotkeyManagerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/AppName.swift \
		Sources/ModifierKeyEventState.swift \
		Sources/ShortcutBinding.swift \
		Sources/ShortcutCore/DictationShortcutSessionController.swift \
		Sources/ShortcutCore/ShortcutModels.swift \
		Sources/ShortcutCore/ShortcutMatcher.swift \
		Sources/GlobalShortcutBackend.swift \
		Sources/HotkeyManager.swift \
		Tests/HotkeyManagerTests.swift
	$(BUILD_DIR)/tests/HotkeyManagerTests

test-hotkey-recording-gate:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/HotkeyRecordingGateTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopLoginBridge.swift \
		Sources/DesktopAuthStateOwner.swift \
		Sources/ShortcutCore/ShortcutModels.swift \
		Sources/RecordingDurationTimer.swift \
		Sources/MicrophonePermissionGate.swift \
		Sources/FirstRunOnboardingCoordinator.swift \
		Sources/HotkeyRecordingGate.swift \
		Tests/HotkeyRecordingGateTests.swift
	$(BUILD_DIR)/tests/HotkeyRecordingGateTests

test-recording-island-state-machine:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RecordingIslandStateMachineTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/PrivacySettingsPresentation.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopLoginBridge.swift \
		Sources/DesktopAuthStateOwner.swift \
		Sources/ShortcutCore/ShortcutModels.swift \
		Sources/RecordingDurationTimer.swift \
		Sources/MicrophonePermissionGate.swift \
		Sources/FirstRunOnboardingCoordinator.swift \
		Sources/HotkeyRecordingGate.swift \
		Sources/DirectInsertionCoordinator.swift \
		Sources/RecordingIslandStateMachine.swift \
		Sources/RecordingIslandVisualTestHarness.swift \
		Tests/RecordingIslandStateMachineTests.swift
	$(BUILD_DIR)/tests/RecordingIslandStateMachineTests

test-recording-island-visual-harness: test-recording-island-state-machine

test-recording-duration-timer:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RecordingDurationTimerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/ShortcutCore/ShortcutModels.swift \
		Sources/RecordingDurationTimer.swift \
		Tests/RecordingDurationTimerTests.swift
	$(BUILD_DIR)/tests/RecordingDurationTimerTests

test-recording-duration-upload-gate:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RecordingDurationUploadGateTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/ShortcutCore/ShortcutModels.swift \
		Sources/RecordingDurationTimer.swift \
		Sources/TransientRecordingArtifact.swift \
		Sources/RecordingDurationUploadGate.swift \
		Tests/RecordingDurationUploadGateTests.swift
	$(BUILD_DIR)/tests/RecordingDurationUploadGateTests

test-live-audio-level-normalizer:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/LiveAudioLevelNormalizerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/LiveAudioLevelNormalizer.swift \
		Tests/LiveAudioLevelNormalizerTests.swift
	$(BUILD_DIR)/tests/LiveAudioLevelNormalizerTests

test-transient-recording-artifact:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/TransientRecordingArtifactTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/TransientRecordingArtifact.swift \
		Tests/TransientRecordingArtifactTests.swift
	$(BUILD_DIR)/tests/TransientRecordingArtifactTests

test-dictation-timing-run:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DictationTimingRunTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DictationTimingRun.swift \
		Tests/DictationTimingRunTests.swift
	$(BUILD_DIR)/tests/DictationTimingRunTests

test-pipeline-history-privacy:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-D DEBUG \
		-o $(BUILD_DIR)/tests/PipelineHistoryPrivacyTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/AppName.swift \
		Sources/PipelineHistoryItem.swift \
		Sources/PipelineHistoryStore.swift \
		Sources/TestCaseExporter.swift \
		Tests/PipelineHistoryPrivacyTests.swift
	$(BUILD_DIR)/tests/PipelineHistoryPrivacyTests

test-personal-dictionary-store:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/PersonalDictionaryStoreTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/PersonalDictionaryStore.swift \
		Tests/PersonalDictionaryStoreTests.swift
	$(BUILD_DIR)/tests/PersonalDictionaryStoreTests

test-personal-dictionary-settings-flow:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/PersonalDictionarySettingsFlowTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/PersonalDictionaryStore.swift \
		Sources/PersonalDictionarySettingsFlow.swift \
		Tests/PersonalDictionarySettingsFlowTests.swift
	$(BUILD_DIR)/tests/PersonalDictionarySettingsFlowTests

test-recent-wispr-store:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RecentWisprStoreTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/RecentWisprStore.swift \
		Tests/RecentWisprStoreTests.swift
	$(BUILD_DIR)/tests/RecentWisprStoreTests

test-privacy-settings-presentation:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/PrivacySettingsPresentationTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/PrivacySettingsPresentation.swift \
		Sources/AdvancedSettingsPresentation.swift \
		Tests/PrivacySettingsPresentationTests.swift
	$(BUILD_DIR)/tests/PrivacySettingsPresentationTests

test-appearance-settings-presentation:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/AppearanceSettingsPresentationTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/AppearanceSettingsPresentation.swift \
		Tests/AppearanceSettingsPresentationTests.swift
	$(BUILD_DIR)/tests/AppearanceSettingsPresentationTests

test-recent-wisprs-history-menu-state:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RecentWisprsHistoryMenuStateTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/RecentWisprStore.swift \
		Sources/RecentWisprsHistoryMenuState.swift \
		Tests/RecentWisprsHistoryMenuStateTests.swift
	$(BUILD_DIR)/tests/RecentWisprsHistoryMenuStateTests

test-recent-wispr-recovery-controller:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/RecentWisprRecoveryControllerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/RecentWisprStore.swift \
		Sources/ClipboardFallbackManager.swift \
		Sources/RecentWisprRecoveryController.swift \
		Tests/RecentWisprRecoveryControllerTests.swift
	$(BUILD_DIR)/tests/RecentWisprRecoveryControllerTests

test-direct-insertion-coordinator:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DirectInsertionCoordinatorTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DirectInsertionCoordinator.swift \
		Tests/DirectInsertionCoordinatorTests.swift
	$(BUILD_DIR)/tests/DirectInsertionCoordinatorTests

test-clipboard-fallback-manager:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/ClipboardFallbackManagerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/ClipboardFallbackManager.swift \
		Tests/ClipboardFallbackManagerTests.swift
	$(BUILD_DIR)/tests/ClipboardFallbackManagerTests

test-update-manager:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-parse-as-library \
		-o $(BUILD_DIR)/tests/UpdateManagerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/AppName.swift \
		Sources/UpdateManager.swift \
		Tests/UpdateManagerTests.swift
	$(BUILD_DIR)/tests/UpdateManagerTests

test-secret-guardrails:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-parse-as-library \
		-o $(BUILD_DIR)/tests/SourceGuardrailTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Tests/SourceGuardrailTests.swift
	$(BUILD_DIR)/tests/SourceGuardrailTests

test: test-session-store test-backend-client test-openai-realtime-transcription-session test-auth-state-owner test-account-settings-presenter test-login-bridge test-onboarding-coordinator test-hotkey-manager test-hotkey-recording-gate test-recording-island-state-machine test-recording-duration-timer test-recording-duration-upload-gate test-live-audio-level-normalizer test-transient-recording-artifact test-dictation-timing-run test-pipeline-history-privacy test-personal-dictionary-store test-personal-dictionary-settings-flow test-privacy-settings-presentation test-appearance-settings-presentation test-recent-wispr-store test-recent-wisprs-history-menu-state test-recent-wispr-recovery-controller test-direct-insertion-coordinator test-clipboard-fallback-manager test-update-manager test-secret-guardrails
