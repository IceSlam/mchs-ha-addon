#!/usr/bin/env bash
set -euo pipefail
. /opt/mchs-redroid/common.sh

BUNDLED_LISTENER_APK="/opt/mchs-provisioning/apks/mchs-listener.apk"
UPLOADED_LISTENER_APK="/data/uploads/mchs-listener.apk"
MCHS_APK="$(opt mchs_apk_path /data/uploads/mchs.apk)"
LISTENER_PACKAGE="dev.mchsha.listener"
STATUS_DIR="/data/status"
STATUS_FILE="${STATUS_DIR}/provisioning.json"

mkdir -p "$STATUS_DIR"

json_array() {
  jq -R -s 'split("\n") | map(select(length > 0))'
}

write_status() {
  local status="$1"
  local message="$2"
  local listener_apk="${3:-}"
  local listener_status="${4:-unknown}"
  local mchs_package="${5:-}"
  local gms="${6:-unknown}"
  local notification_access="${7:-unknown}"
  jq -n \
    --arg status "$status" \
    --arg message "$message" \
    --arg listener_apk "$listener_apk" \
    --arg listener "$listener_status" \
    --arg mchs "$mchs_package" \
    --arg gms "$gms" \
    --arg notification_access "$notification_access" \
    --arg time "$(date -Iseconds)" \
    '{
      status: $status,
      message: $message,
      listener_apk: $listener_apk,
      listener: $listener,
      mchs_package: $mchs,
      google_play_services: $gms,
      notification_access: $notification_access,
      updated_at: $time
    }' > "$STATUS_FILE"
}

pkg_installed() {
  adb -s "$ADB_TARGET" shell pm path "$1" >/dev/null 2>&1
}

install_apk() {
  local apk="$1"
  log "installing $(basename "$apk")"
  adb -s "$ADB_TARGET" install -r "$apk" >/dev/null
}

listener_apk_path() {
  if [ -f "$BUNDLED_LISTENER_APK" ]; then
    echo "$BUNDLED_LISTENER_APK"
  elif [ -f "$UPLOADED_LISTENER_APK" ]; then
    echo "$UPLOADED_LISTENER_APK"
  fi
}

grant_common_permissions() {
  local pkg="$1"
  for perm in \
    android.permission.POST_NOTIFICATIONS \
    android.permission.INTERNET \
    android.permission.ACCESS_NETWORK_STATE \
    android.permission.WAKE_LOCK; do
    adb -s "$ADB_TARGET" shell pm grant "$pkg" "$perm" >/dev/null 2>&1 || true
  done
}

check_gms() {
  if ! adb -s "$ADB_TARGET" get-state >/dev/null 2>&1; then
    echo "unknown"
  elif adb -s "$ADB_TARGET" shell pm list packages com.google.android.gms 2>/dev/null | grep -q 'com.google.android.gms'; then
    echo "installed"
  else
    echo "missing"
  fi
}

notification_access_status() {
  local enabled
  enabled="$(adb -s "$ADB_TARGET" shell settings get secure enabled_notification_listeners 2>/dev/null | tr -d '\r' || true)"
  if echo "$enabled" | grep -q "$LISTENER_PACKAGE"; then
    echo "enabled"
  else
    echo "not_enabled"
  fi
}

find_mchs_package() {
  local packages labels pkg
  packages="$(adb -s "$ADB_TARGET" shell pm list packages 2>/dev/null | tr -d '\r' | sed 's/^package://')"
  if [ -f "$OPTIONS_FILE" ]; then
    while read -r pkg; do
      if echo "$packages" | grep -qx "$pkg"; then
        echo "$pkg"
        return 0
      fi
    done < <(jq -r '.mchs_package_candidates[]?' "$OPTIONS_FILE")
  fi
  while read -r pkg; do
    labels="$(adb -s "$ADB_TARGET" shell dumpsys package "$pkg" 2>/dev/null | tr -d '\r' || true)"
    if echo "$pkg $labels" | grep -Eiq 'mchs|мчс'; then
      echo "$pkg"
      return 0
    fi
  done <<< "$packages"
  return 1
}

open_notification_access() {
  adb -s "$ADB_TARGET" shell am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS >/dev/null 2>&1 || true
}

main() {
  write_status "running" "waiting for Android boot"
  /opt/mchs-redroid/manager.sh wait-boot 300

  local gms listener_apk mchs_pkg notification_status
  gms="$(check_gms)"
  if [ "$gms" = "missing" ] && [ "$REDROID_REQUIRES_GMS" = "true" ]; then
    log "Google Play Services are missing. FCM push notifications may not work. Use a Redroid image with GMS/MindTheGapps."
  fi

  listener_apk="$(listener_apk_path || true)"
  if [ -z "$listener_apk" ]; then
    local message="Listener APK not found. Upload it in Web UI or use bundled release."
    log "$message"
    write_status "error" "$message" "" "missing" "" "$gms" "unknown"
    exit 10
  fi

  install_apk "$listener_apk"
  grant_common_permissions "$LISTENER_PACKAGE"

  if [ -f "$MCHS_APK" ]; then
    install_apk "$MCHS_APK"
  else
    log "MCHS APK not uploaded; skipping MCHS install"
  fi

  adb -s "$ADB_TARGET" shell pm list packages >/data/status/packages.txt 2>/dev/null || true

  if pkg_installed "$LISTENER_PACKAGE"; then
    listener_status="installed"
  else
    listener_status="missing"
  fi

  mchs_pkg="$(find_mchs_package || true)"
  notification_status="$(notification_access_status)"

  open_notification_access
  if [ -n "$mchs_pkg" ]; then
    log "MCHS package detected: $mchs_pkg"
    adb -s "$ADB_TARGET" shell monkey -p "$mchs_pkg" 1 >/dev/null 2>&1 || true
  else
    log "MCHS package not installed yet"
  fi

  write_status "ok" "provisioning completed" "$listener_apk" "$listener_status" "$mchs_pkg" "$gms" "$notification_status"
}

main "$@"
