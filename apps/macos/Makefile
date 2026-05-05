APP_NAME ?= RubyWhisper
BUNDLE_ID ?= com.rubyadvisory.rubywhisper.dev
BUILD_DIR = build
APP_BUNDLE = $(BUILD_DIR)/$(APP_NAME).app
CODESIGN_IDENTITY ?= -
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

.PHONY: all clean run icon dmg codesign-dmg notarize test test-session-store test-backend-client test-auth-state-owner test-login-bridge test-onboarding-coordinator test-hotkey-manager test-hotkey-recording-gate test-recording-island-state-machine test-recording-island-visual-harness test-recording-duration-timer test-live-audio-level-normalizer test-transient-recording-artifact test-pipeline-history-privacy test-personal-dictionary-store test-personal-dictionary-settings-flow test-secret-guardrails

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
	@cp $(ICON_ICNS) "$(RESOURCES)/AppIcon.icns"
	@cp "$(THIRD_PARTY_NOTICES)" "$(RESOURCES)/ThirdPartyNotices.md"
	@plutil -replace NSMicrophoneUsageDescription -string "$(APP_NAME) needs microphone access to transcribe your speech." "$(CONTENTS)/Info.plist"
	@plutil -replace NSSpeechRecognitionUsageDescription -string "$(APP_NAME) needs speech recognition to convert your voice to text." "$(CONTENTS)/Info.plist"
	@plutil -replace NSAccessibilityUsageDescription -string "$(APP_NAME) needs accessibility access to detect the text cursor position and paste transcribed text." "$(CONTENTS)/Info.plist"
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

dmg: all
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

codesign-dmg: dmg
	codesign --force --sign "$(CODESIGN_IDENTITY)" "$(BUILD_DIR)/$(APP_NAME).dmg"

notarize:
	xcrun notarytool submit "$(BUILD_DIR)/$(APP_NAME).dmg" \
		--keychain-profile "$(NOTARIZE_PROFILE)" --wait
	xcrun stapler staple "$(BUILD_DIR)/$(APP_NAME).dmg"

clean:
	rm -rf $(BUILD_DIR)

run: all
	open "$(APP_BUNDLE)"

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
		Sources/RubyWhisperBackendAPIClient.swift \
		Tests/RubyWhisperBackendAPIClientTests.swift
	$(BUILD_DIR)/tests/RubyWhisperBackendAPIClientTests

test-auth-state-owner:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DesktopAuthStateOwnerTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopLoginBridge.swift \
		Sources/DesktopAuthStateOwner.swift \
		Tests/DesktopAuthStateOwnerTests.swift
	$(BUILD_DIR)/tests/DesktopAuthStateOwnerTests

test-login-bridge:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/DesktopLoginBridgeTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/DesktopSessionStore.swift \
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
		Sources/RubyWhisperBackendAPIClient.swift \
		Sources/DesktopLoginBridge.swift \
		Sources/DesktopAuthStateOwner.swift \
		Sources/ShortcutCore/ShortcutModels.swift \
		Sources/RecordingDurationTimer.swift \
		Sources/MicrophonePermissionGate.swift \
		Sources/FirstRunOnboardingCoordinator.swift \
		Sources/HotkeyRecordingGate.swift \
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

test-pipeline-history-privacy:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-o $(BUILD_DIR)/tests/PipelineHistoryPrivacyTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Sources/AppName.swift \
		Sources/PipelineHistoryItem.swift \
		Sources/PipelineHistoryStore.swift \
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

test-secret-guardrails:
	@mkdir -p $(BUILD_DIR)/tests
	swiftc \
		-parse-as-library \
		-o $(BUILD_DIR)/tests/SourceGuardrailTests \
		-sdk $(shell xcrun --show-sdk-path) \
		-target $(ARCH)-apple-macosx13.0 \
		Tests/SourceGuardrailTests.swift
	$(BUILD_DIR)/tests/SourceGuardrailTests

test: test-session-store test-backend-client test-auth-state-owner test-login-bridge test-onboarding-coordinator test-hotkey-manager test-hotkey-recording-gate test-recording-island-state-machine test-recording-duration-timer test-live-audio-level-normalizer test-transient-recording-artifact test-pipeline-history-privacy test-personal-dictionary-store test-personal-dictionary-settings-flow test-secret-guardrails
