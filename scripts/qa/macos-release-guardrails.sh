#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
macos_dir="$repo_root/apps/macos"

echo "RubyWhisper macOS release guardrail smoke"
echo "Private env files: not read by this script"
echo "Release signing/notarization/upload: not performed"

run_expect_failure() {
  local label="$1"
  local expected="$2"
  shift 2

  local output
  local status

  set +e
  output="$(make -C "$macos_dir" "$@" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    echo "FAIL $label: command unexpectedly succeeded" >&2
    exit 1
  fi

  if [[ "$output" != *"$expected"* ]]; then
    echo "FAIL $label: expected output to include '$expected'" >&2
    echo "$output" >&2
    exit 1
  fi

  echo "OK $label failed closed"
}

run_expect_failure_any() {
  local label="$1"
  shift

  local patterns=()
  while [[ "$#" -gt 0 && "$1" != "--" ]]; do
    patterns+=("$1")
    shift
  done

  if [[ "$#" -eq 0 ]]; then
    echo "FAIL $label: missing -- command separator" >&2
    exit 1
  fi
  shift

  local output
  local status

  set +e
  output="$(make -C "$macos_dir" "$@" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    echo "FAIL $label: command unexpectedly succeeded" >&2
    exit 1
  fi

  for pattern in "${patterns[@]}"; do
    if [[ "$output" == *"$pattern"* ]]; then
      echo "OK $label failed closed"
      return
    fi
  done

  echo "FAIL $label: output did not include an expected failure category" >&2
  echo "$output" >&2
  exit 1
}

run_expect_failure \
  "codesign-dmg rejects blank signing identities" \
  "Release signing blocked: set CODESIGN_IDENTITY" \
  codesign-dmg CODESIGN_IDENTITY=

run_expect_failure \
  "codesign-dmg rejects ad hoc signing" \
  "Release signing blocked: set CODESIGN_IDENTITY" \
  codesign-dmg CODESIGN_IDENTITY=-

run_expect_failure \
  "codesign-dmg rejects placeholder identities" \
  "Release signing blocked: CODESIGN_IDENTITY must not be a placeholder" \
  codesign-dmg "CODESIGN_IDENTITY=<DEVELOPER_ID_APPLICATION_IDENTITY>"

run_expect_failure \
  "release signing preflight rejects missing Developer ID identities" \
  "Release signing blocked: the requested Developer ID Application identity is not installed" \
  release-signing-preflight "CODESIGN_IDENTITY=Developer ID Application: RubyWhisper Missing Guardrail Identity (TEAMID)"

run_expect_failure \
  "notarize rejects ad hoc signing before notary work" \
  "Release signing blocked: set CODESIGN_IDENTITY" \
  notarize CODESIGN_IDENTITY=- NOTARIZE_PROFILE=rubywhisper-guardrail-profile

run_expect_failure \
  "notarize-preflight rejects missing profiles" \
  "Notarization blocked: set NOTARIZE_PROFILE" \
  notarize-preflight NOTARIZE_PROFILE=

run_expect_failure \
  "notarize-preflight rejects placeholder profiles" \
  "Notarization blocked: NOTARIZE_PROFILE must not be a placeholder" \
  notarize-preflight "NOTARIZE_PROFILE=<NOTARY_KEYCHAIN_PROFILE>"

guardrail_app_name="RubyWhisper Missing Guardrail DMG"
rm -f "$macos_dir/build/$guardrail_app_name.dmg"
run_expect_failure_any \
  "notarize-preflight rejects missing artifacts or unavailable notary tools" \
  "Notarization blocked: expected build/$guardrail_app_name.dmg to exist before submission" \
  "Notarization blocked: xcrun notarytool is unavailable" \
  "Notarization blocked: xcrun stapler is unavailable" \
  -- \
  notarize-preflight \
  "APP_NAME=$guardrail_app_name" \
  NOTARIZE_PROFILE=rubywhisper-guardrail-profile

echo "OK macOS release guardrail smoke passed"
