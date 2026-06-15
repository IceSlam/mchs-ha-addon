#!/usr/bin/env bash
set -euo pipefail
. /opt/mchs-redroid/common.sh

LISTENER_APK="/opt/mchs-provisioning/apks/mchs-listener.apk"
MCHS_APK="/data/uploads/mchs.apk"
LISTENER_PACKAGE="dev.mchsha.listener"

pkg_installed() {
  adb -s "$ADB_TARGET" shell pm path "$1" >/dev/null 2>&1
}

install_apk() {
  local apk="$1"
  if [ ! -f "$apk" ]; then
    return 1
  fi
  log "installing $(basename "$apk")"
  adb -s "$ADB_TARGET" install -r "$apk" >/dev/null
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
  if pkg_installed com.google.android.gms; then
    echo "present"
  else
    echo "missing"
  fi
}

find_mchs_package() {
  if [ -f "$OPTIONS_FILE" ]; then
    jq -r '.mchs_package_candidates[]?' "$OPTIONS_FILE"
  else
    printf '%s\n' ru.mchs ru.mchs.app ru.mchs.mobile ru.mchs.informer
  fi | while read -r pkg; do
    if pkg_installed "$pkg"; then
      echo "$pkg"
      break
    fi
  done
}

open_notification_access() {
  adb -s "$ADB_TARGET" shell am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS >/dev/null 2>&1 || true
}

main() {
  /opt/mchs-redroid/manager.sh wait-boot 300
  local gms
  gms="$(check_gms)"
  if [ "$gms" = "missing" ]; then
    log "Google Play Services missing; user must use a Redroid image with GMS or install GMS-compatible image"
  fi

  if [ -f "$LISTENER_APK" ]; then
    install_apk "$LISTENER_APK"
    grant_common_permissions "$LISTENER_PACKAGE"
  else
    log "listener APK not found at $LISTENER_APK"
  fi

  if [ -f "$MCHS_APK" ]; then
    install_apk "$MCHS_APK"
  fi

  local mchs_pkg
  mchs_pkg="$(find_mchs_package || true)"
  if [ -n "$mchs_pkg" ]; then
    log "MCHS package detected: $mchs_pkg"
    adb -s "$ADB_TARGET" shell monkey -p "$mchs_pkg" 1 >/dev/null 2>&1 || true
  else
    log "MCHS package not installed yet"
  fi

  open_notification_access
}

main "$@"
