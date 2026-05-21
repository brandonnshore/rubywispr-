#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_name="${RUBYWHISPER_MACOS_APP_NAME:-RubyWhisper}"
bundle_id="${RUBYWHISPER_MACOS_BUNDLE_ID:-com.rubyadvisory.rubywhisper.local}"
build_dir="$repo_root/apps/macos/build"
app_path="$build_dir/$app_name.app"
dmg_path="$build_dir/$app_name.dmg"

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL $label: expected '$expected', got '$actual'" >&2
    exit 1
  fi
}

plist_value() {
  local key="$1"
  local plist_path="$2"

  plutil -extract "$key" raw "$plist_path"
}

echo "RubyWhisper macOS local package smoke"
echo "App name: $app_name"
echo "Bundle ID: $bundle_id"
echo "Private env files: not read by this script"
echo "Release signing/notarization/upload: not performed"

for tool in make hdiutil plutil codesign; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "FAIL required tool missing: $tool" >&2
    exit 1
  fi
done

make -C "$repo_root/apps/macos" clean dmg \
  APP_NAME="$app_name" \
  BUNDLE_ID="$bundle_id" \
  CODESIGN_IDENTITY=-

test -d "$app_path"
test -f "$dmg_path"
test -f "$app_path/Contents/Info.plist"
test -f "$app_path/Contents/Resources/ThirdPartyNotices.md"
test -x "$app_path/Contents/MacOS/$app_name"
assert_eq "$(plist_value CFBundleIdentifier "$app_path/Contents/Info.plist")" "$bundle_id" "CFBundleIdentifier"
assert_eq "$(plist_value CFBundleName "$app_path/Contents/Info.plist")" "$app_name" "CFBundleName"
assert_eq "$(plist_value CFBundleExecutable "$app_path/Contents/Info.plist")" "$app_name" "CFBundleExecutable"
assert_eq "$(plist_value LSUIElement "$app_path/Contents/Info.plist")" "false" "LSUIElement"
assert_eq "$(plist_value RubyWhisperUpdateChannelEnabled "$app_path/Contents/Info.plist")" "false" "RubyWhisperUpdateChannelEnabled"
assert_eq "$(plist_value RubyWhisperBackendBaseURL "$app_path/Contents/Info.plist")" "https://rubywhisper-web.vercel.app" "RubyWhisperBackendBaseURL"

codesign -dv "$app_path" 2>&1 | grep -q "Signature=adhoc"
codesign --verify --deep --strict --verbose=2 "$app_path"
hdiutil verify "$dmg_path" >/dev/null

mountpoint="$(mktemp -d)"
cleanup() {
  hdiutil detach "$mountpoint" >/dev/null 2>&1 || true
  rmdir "$mountpoint" >/dev/null 2>&1 || true
}
trap cleanup EXIT

hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mountpoint" >/dev/null
test -d "$mountpoint/$app_name.app"
test -L "$mountpoint/Applications"
test "$(readlink "$mountpoint/Applications")" = "/Applications"
test -f "$mountpoint/$app_name.app/Contents/Resources/ThirdPartyNotices.md"
assert_eq "$(plist_value CFBundleIdentifier "$mountpoint/$app_name.app/Contents/Info.plist")" "$bundle_id" "mounted CFBundleIdentifier"
codesign --verify --deep --strict --verbose=2 "$mountpoint/$app_name.app"

echo "OK local ad hoc app bundle verified: $app_path"
echo "OK local ad hoc DMG shape verified: $dmg_path"
echo "OK macOS local package smoke passed"
