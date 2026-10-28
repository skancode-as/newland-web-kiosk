#!/usr/bin/env bash
#
# Read-only inspection of a Newland Web Kiosk install over adb.
#
# Discovers the attached device (or ADB_SERIAL), identifies the kiosk package,
# pulls its APKs, extracts assets and greps DEX strings for the bridge names
# documented in plan.md and confirmed on the MT90.
#
# Usage:
#   bash scripts/adb-inspect.sh
#   ADB_SERIAL=ABC123 bash scripts/adb-inspect.sh
#   ADB=/path/to/adb bash scripts/adb-inspect.sh
#
# No installs, settings changes, force-stops or other device mutations.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

REPORT_DIR="$ROOT_DIR/artifacts"
REPORT="$REPORT_DIR/adb-report.txt"
APK_DIR="$REPORT_DIR/apk"

TOKENS='nlScan|nlBarcode|nlNFC|nlNHub|nlNHubResult|nlNHubRestult|NHubSend|NGetModel|NGetSerial|NGetBuild|NGetDeviceName|Triggermode|TriggerMode|DeviceModel|SerialNumber|serialNumber|RepeatInterval|ConfigureSymbology|BarcodeConfig|Scanmode|scannerPower'

mkdir -p "$REPORT_DIR" "$APK_DIR" || {
  printf 'ERROR: could not create %s\n' "$REPORT_DIR" >&2
  exit 1
}

: > "$REPORT" || {
  printf 'ERROR: could not write %s\n' "$REPORT" >&2
  exit 1
}

# Mirror everything to the report file and to the terminal.
exec > >(tee -a "$REPORT") 2>&1

ADB_BIN="${ADB:-adb}"
ADB_SERIAL="${ADB_SERIAL:-}"
SERIAL="$ADB_SERIAL"

say() {
  printf '%s\n' "$*"
}

section() {
  printf '\n===== %s =====\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*"
  printf 'Report: %s\n' "$REPORT"
  exit 1
}

adb_cmd() {
  # < /dev/null is required: when called inside a `while read` loop, adb would
  # otherwise inherit and drain the loop's stdin, silently truncating iteration.
  # No adb subcommand used here (shell, pull, ...) needs stdin.
  if [ -n "$SERIAL" ]; then
    "$ADB_BIN" -s "$SERIAL" "$@" < /dev/null
  else
    "$ADB_BIN" "$@" < /dev/null
  fi
}

say "Newland Web Kiosk adb inspection"
say "Project: $ROOT_DIR"
say "Started: $(date)"
say "ADB: $ADB_BIN"
if [ -n "$ADB_SERIAL" ]; then
  say "Requested serial: $ADB_SERIAL"
else
  say "Requested serial: (auto-detect)"
fi

# ---------------------------------------------------------------------------
# 1. adb and device availability
# ---------------------------------------------------------------------------

section "adb version"
if ! ADB_VERSION="$(adb_cmd version 2>&1)"; then
  say "$ADB_VERSION"
  fail "Could not run '$ADB_BIN'. Install Android platform-tools or set ADB=/path/to/adb."
fi
say "$ADB_VERSION"

section "adb devices -l"
if ! DEVICES="$(adb_cmd devices -l 2>&1)"; then
  say "$DEVICES"
  fail "'$ADB_BIN devices -l' failed. Is the adb server running?"
fi

DEVICES="$(printf '%s\n' "$DEVICES" | tr -d '\r')"
say "$DEVICES"

if [ -n "$ADB_SERIAL" ]; then
  if ! printf '%s\n' "$DEVICES" | awk -v want="$ADB_SERIAL" '$1 == want && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'; then
    if printf '%s\n' "$DEVICES" | awk -v want="$ADB_SERIAL" '$1 == want && $2 == "unauthorized" { found = 1 } END { exit found ? 0 : 1 }'; then
      fail "Device $ADB_SERIAL is unauthorized. Unlock the MT90 and accept the USB debugging prompt, then re-run."
    fi
    fail "Device $ADB_SERIAL is not available. Check the USB cable and 'adb devices -l'."
  fi
else
  DEVICE_COUNT="$(printf '%s\n' "$DEVICES" | awk '$2 == "device" { count++ } END { print count + 0 }')"

  if [ "$DEVICE_COUNT" -eq 0 ]; then
    if printf '%s\n' "$DEVICES" | awk '$2 == "unauthorized" { found = 1 } END { exit found ? 0 : 1 }'; then
      fail "An adb device is present but unauthorized. Unlock the MT90 and accept the USB debugging prompt, then re-run."
    fi
    fail "No authorized adb device found. Connect the MT90 over USB, enable USB debugging and authorize this computer."
  fi

  if [ "$DEVICE_COUNT" -gt 1 ]; then
    say "Multiple adb devices detected:"
    printf '%s\n' "$DEVICES" | awk '$2 == "device" { print "  " $1 }'
    fail "Choose one with ADB_SERIAL=<serial> bash scripts/adb-inspect.sh"
  fi

  SERIAL="$(printf '%s\n' "$DEVICES" | awk '$2 == "device" { print $1; exit }')"
fi

say "Using serial: $SERIAL"

# ---------------------------------------------------------------------------
# 2. Device properties
# ---------------------------------------------------------------------------

section "Device properties"
for prop in \
  ro.product.manufacturer \
  ro.product.model \
  ro.product.device \
  ro.build.version.release \
  ro.build.version.sdk \
  ro.build.fingerprint \
  ro.build.version.security_patch
do
  PROP_VALUE="$(adb_cmd shell getprop "$prop" 2>/dev/null | tr -d '\r' | head -n 1)"
  if [ -n "$PROP_VALUE" ]; then
    say "$prop: $PROP_VALUE"
  else
    say "$prop: (not set)"
  fi
done

# ---------------------------------------------------------------------------
# 3. Current activity
# ---------------------------------------------------------------------------

section "Current resumed activity"
RESUMED="$(adb_cmd shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' || true)"
if [ -n "$RESUMED" ]; then
  say "$RESUMED"
else
  say "(no resumed activity lines found)"
fi

# ---------------------------------------------------------------------------
# 4. Candidate packages
# ---------------------------------------------------------------------------

section "Candidate packages"
PACKAGE_LIST="$(adb_cmd shell pm list packages 2>/dev/null | tr -d '\r' || true)"
# nlbrowser matches com.nls.nlbrowser; com.nls is the confirmed vendor prefix.
CANDIDATES="$(printf '%s\n' "$PACKAGE_LIST" | sed 's/^package://' | grep -Ei 'newland|kiosk|nlscan|webkiosk|nlbrowser|com\.nls' | sort -u || true)"

if [ -n "$CANDIDATES" ]; then
  say "$CANDIDATES"
else
  say "(no candidate packages matched newland|kiosk|nlscan|webkiosk|nlbrowser|com.nls)"
fi

section "All third-party packages (fallback identification)"
THIRD_PARTY="$(adb_cmd shell pm list packages -3 2>/dev/null | tr -d '\r' | sed 's/^package://' | sort -u || true)"
if [ -n "$THIRD_PARTY" ]; then
  say "$THIRD_PARTY"
else
  say "(none reported)"
fi

# ---------------------------------------------------------------------------
# 5. Per-package details and APK pulling
# ---------------------------------------------------------------------------

if [ -n "$CANDIDATES" ]; then
  while IFS= read -r pkg; do
    [ -n "$pkg" ] || continue

    section "Package: $pkg"

    say "-- versionName / versionCode --"
    VERSION_INFO="$(adb_cmd shell dumpsys package "$pkg" 2>/dev/null | tr -d '\r' | grep -E 'versionName|versionCode' | head -n 4 || true)"
    if [ -n "$VERSION_INFO" ]; then
      say "$VERSION_INFO"
    else
      say "(version information not found)"
    fi

    say "-- APK paths (pm path) --"
    APK_PATHS="$(adb_cmd shell pm path "$pkg" 2>/dev/null | tr -d '\r' || true)"
    if [ -n "$APK_PATHS" ]; then
      say "$APK_PATHS"
    else
      say "(no APK paths returned)"
    fi

    say "-- Pulling APKs into $APK_DIR --"
    if [ -n "$APK_PATHS" ]; then
      while IFS= read -r apk_path; do
        apk_path="$(printf '%s' "$apk_path" | tr -d '\r')"
        case "$apk_path" in
          package:*) apk_path="${apk_path#package:}" ;;
        esac
        [ -n "$apk_path" ] || continue

        apk_base="${apk_path##*/}"
        [ -n "$apk_base" ] || apk_base="app.apk"
        apk_dest="$APK_DIR/${pkg}__${apk_base}"

        if adb_cmd pull "$apk_path" "$apk_dest"; then
          say "Pulled: $apk_dest"
        else
          say "WARN: failed to pull $apk_path"
        fi
      done <<< "$APK_PATHS"
    else
      say "(nothing to pull)"
    fi

    say "-- Activity / intent-filter details --"
    ACTIVITY_INFO="$(adb_cmd shell dumpsys package "$pkg" 2>/dev/null | tr -d '\r' | grep -E 'Activity|intent|Intent|scheme|BROWSABLE|VIEW|newland' | head -n 120 || true)"
    if [ -n "$ACTIVITY_INFO" ]; then
      say "$ACTIVITY_INFO"
    else
      say "(no activity or intent-filter details found)"
    fi

    say "-- Resolved newlandhttps://example.com --"
    RESOLVED="$(adb_cmd shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d "newlandhttps://example.com" 2>/dev/null | tr -d '\r' || true)"
    if [ -n "$RESOLVED" ]; then
      say "$RESOLVED"
    else
      say "(no activity resolved; the kiosk may not be the default VIEW handler)"
    fi
  done <<< "$CANDIDATES"
else
  section "Package inspection skipped"
  say "No candidate package was found, so no APK was pulled."
fi

# ---------------------------------------------------------------------------
# 6. WebView debugging and focused window
# ---------------------------------------------------------------------------

section "WebView debugging sockets"
SOCKETS="$(adb_cmd shell cat /proc/net/unix 2>/dev/null | tr -d '\r' | grep -i 'webview_devtools_remote' || true)"
if [ -n "$SOCKETS" ]; then
  say "$SOCKETS"
  say ""
  say "To attach Chrome DevTools, forward one socket, for example:"
  say "  adb forward tcp:9222 localabstract:<socket-name>"
  say "Then open chrome://inspect in desktop Chrome."
else
  say "(no webview_devtools_remote socket found; WebView debugging may be disabled)"
fi

section "Focused window / activity"
FOCUS="$(adb_cmd shell dumpsys window windows 2>/dev/null | tr -d '\r' | grep -E 'mCurrentFocus|mFocusedApp' || true)"
if [ -n "$FOCUS" ]; then
  say "$FOCUS"
else
  say "(no focused window lines found)"
fi

# ---------------------------------------------------------------------------
# 7. Pulled APK inspection
# ---------------------------------------------------------------------------

section "Pulled APK inspection"
APK_FOUND=0

for apk in "$APK_DIR"/*.apk; do
  [ -f "$apk" ] || continue
  APK_FOUND=1

  apk_name="${apk##*/}"
  apk_stem="${apk_name%.apk}"
  extract_dir="$APK_DIR/${apk_stem}-extracted"

  say ""
  say "--- $apk_name ---"

  ENTRIES="$(unzip -Z1 "$apk" 2>/dev/null || true)"
  if [ -z "$ENTRIES" ]; then
    say "(could not enumerate archive entries; unzip may be unavailable or the APK is incomplete)"
    continue
  fi

  say "-- Archive entries matching js/html/htm/json --"
  TEXT_ENTRIES="$(printf '%s\n' "$ENTRIES" | grep -Ei '\.(js|html|htm|json)$' || true)"
  if [ -n "$TEXT_ENTRIES" ]; then
    say "$TEXT_ENTRIES"
  else
    say "(none)"
  fi

  HAS_ASSETS=0
  HAS_RAW=0
  if printf '%s\n' "$ENTRIES" | grep -Eq '^assets/'; then
    HAS_ASSETS=1
  fi
  if printf '%s\n' "$ENTRIES" | grep -Eq '^res/raw/'; then
    HAS_RAW=1
  fi

  if [ "$HAS_ASSETS" -eq 1 ] || [ "$HAS_RAW" -eq 1 ]; then
    mkdir -p "$extract_dir"
    say "-- Extracting assets/* and res/raw/* to $extract_dir --"
    EXTRACT_FAILED=0
    if [ "$HAS_ASSETS" -eq 1 ]; then
      (cd "$extract_dir" && unzip -o -q "$apk" 'assets/*' 2>/dev/null) || EXTRACT_FAILED=1
    fi
    if [ "$HAS_RAW" -eq 1 ]; then
      (cd "$extract_dir" && unzip -o -q "$apk" 'res/raw/*' 2>/dev/null) || EXTRACT_FAILED=1
    fi
    if [ "$EXTRACT_FAILED" -eq 0 ]; then
      say "Extracted."
    else
      say "WARN: unzip reported a problem for one or more groups; partial extraction may still have succeeded."
    fi

    say "-- Bridge token matches in extracted text files --"
    TOKEN_HITS="$(grep -R -I -n -E "$TOKENS" "$extract_dir" 2>/dev/null || true)"
    if [ -n "$TOKEN_HITS" ]; then
      say "$TOKEN_HITS"
    else
      say "(no matches)"
    fi
  else
    say "-- No assets/ or res/raw/ entries to extract --"
  fi

  say "-- DEX strings matching bridge tokens --"
  DEXES="$(printf '%s\n' "$ENTRIES" | grep -E '(^|/)classes[0-9]*\.dex$' || true)"
  if [ -n "$DEXES" ]; then
    while IFS= read -r dex; do
      [ -n "$dex" ] || continue
      say "   [$dex]"
      DEX_HITS="$(unzip -p "$apk" "$dex" 2>/dev/null | strings | grep -E "$TOKENS" | sort -u || true)"
      if [ -n "$DEX_HITS" ]; then
        say "$DEX_HITS"
      else
        say "   (no matches)"
      fi
    done <<< "$DEXES"
  else
    say "   (no classes*.dex entries found)"
  fi
done

if [ "$APK_FOUND" -eq 0 ]; then
  say "(no APKs were pulled)"
fi

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------

section "Done"
say "Report: $REPORT"
say "Pulled APKs and extracted assets: $APK_DIR"
say "Finished: $(date)"
