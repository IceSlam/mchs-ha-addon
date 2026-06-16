#!/usr/bin/env bash
set -euo pipefail

ADB_HOST="${ADB_HOST:-redroid}"
ADB_PORT="${ADB_PORT:-5555}"
ADB_TARGET="${ADB_HOST}:${ADB_PORT}"
LISTENER_APK="/data/apks/listener/mchs-listener.apk"
MCHS_APK="/data/apks/mchs/mchs.apk"
STATUS_DIR="/data/state"
STATUS_FILE="${STATUS_DIR}/provisioning.json"

mkdir -p "$STATUS_DIR"

status() {
  jq -n \
    --arg status "$1" \
    --arg message "$2" \
    --arg time "$(date -Iseconds)" \
    '{status:$status,message:$message,updated_at:$time}' > "$STATUS_FILE"
}

adb_connect() {
  adb connect "$ADB_TARGET" >/dev/null 2>&1 || true
}

wait_boot() {
  status running "waiting for adb"
  for _ in $(seq 1 90); do
    adb_connect
    if adb -s "$ADB_TARGET" get-state >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  status running "waiting for android boot"
  for _ in $(seq 1 120); do
    if [ "$(adb -s "$ADB_TARGET" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      return 0
    fi
    sleep 2
  done
  status error "android boot timeout"
  return 1
}

pkg_installed() {
  adb -s "$ADB_TARGET" shell pm path "$1" >/dev/null 2>&1
}

find_mchs() {
  for pkg in ru.mchs ru.mchs.app ru.mchs.mobile ru.mchs.informer io.citizens.security; do
    if pkg_installed "$pkg"; then
      echo "$pkg"
      return 0
    fi
  done
  return 1
}

wait_boot

if [ -f "$LISTENER_APK" ]; then
  adb -s "$ADB_TARGET" install -r "$LISTENER_APK" >/dev/null
else
  status error "listener APK missing at $LISTENER_APK"
  exit 10
fi

if [ -f "$MCHS_APK" ]; then
  adb -s "$ADB_TARGET" install -r "$MCHS_APK" >/dev/null
fi

adb -s "$ADB_TARGET" shell pm list packages >/data/state/packages.txt 2>/dev/null || true

gms="missing"
adb -s "$ADB_TARGET" shell pm list packages com.google.android.gms 2>/dev/null | grep -q com.google.android.gms && gms="installed"
listener="missing"
pkg_installed dev.mchsha.listener && listener="installed"
mchs="$(find_mchs || true)"

adb -s "$ADB_TARGET" shell am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS >/dev/null 2>&1 || true
if [ -n "$mchs" ]; then
  adb -s "$ADB_TARGET" shell monkey -p "$mchs" 1 >/dev/null 2>&1 || true
fi

jq -n \
  --arg status ok \
  --arg gms "$gms" \
  --arg listener "$listener" \
  --arg mchs "${mchs:-missing}" \
  --arg time "$(date -Iseconds)" \
  '{status:$status,gms:$gms,listener:$listener,mchs:$mchs,updated_at:$time}' > "$STATUS_FILE"
