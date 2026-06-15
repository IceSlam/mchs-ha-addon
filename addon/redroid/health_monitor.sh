#!/usr/bin/env bash
set -euo pipefail
. /opt/mchs-redroid/common.sh

mqtt_opt() {
  opt "$1" "$2"
}

MQTT_HOST="$(mqtt_opt mqtt_host core-mosquitto)"
MQTT_PORT="$(mqtt_opt mqtt_port 1883)"
MQTT_USERNAME="$(mqtt_opt mqtt_username '')"
MQTT_PASSWORD="$(mqtt_opt mqtt_password '')"
INTERVAL=30

publish() {
  local topic="$1"
  local payload="$2"
  local args=(-h "$MQTT_HOST" -p "$MQTT_PORT" -t "$topic" -m "$payload" -r)
  if [ -n "$MQTT_USERNAME" ]; then
    args+=(-u "$MQTT_USERNAME")
  fi
  if [ -n "$MQTT_PASSWORD" ]; then
    args+=(-P "$MQTT_PASSWORD")
  fi
  mosquitto_pub "${args[@]}" >/dev/null 2>&1 || true
}

while true; do
  health="$(/opt/mchs-redroid/manager.sh health 2>/dev/null || echo '{}')"
  redroid="$(echo "$health" | jq -r '.redroid // "unknown"' 2>/dev/null || echo unknown)"
  adb_state="$(echo "$health" | jq -r '.adb // "unknown"' 2>/dev/null || echo unknown)"
  boot="$(echo "$health" | jq -r '.boot_completed // "0"' 2>/dev/null || echo 0)"

  listener="missing"
  mchs="missing"
  adb_connect
  if adb -s "$ADB_TARGET" shell pm path dev.mchsha.listener >/dev/null 2>&1; then
    listener="installed"
  fi
  if [ -f "$OPTIONS_FILE" ]; then
    while read -r pkg; do
      if adb -s "$ADB_TARGET" shell pm path "$pkg" >/dev/null 2>&1; then
        mchs="$pkg"
        break
      fi
    done < <(jq -r '.mchs_package_candidates[]?' "$OPTIONS_FILE")
  fi

  android_status="$redroid/adb:$adb_state/boot:$boot"
  publish "mchs/system/android" "$android_status"
  publish "mchs/system/listener" "$listener"
  publish "mchs/system/bridge" "online"
  publish "mchs/alerts/listener_status" "$listener"

  if [ "$redroid" != "running" ] || [ "$adb_state" != "connected" ] || [ "$boot" != "1" ]; then
    log "watchdog restarting redroid after unhealthy state: $android_status"
    /opt/mchs-redroid/manager.sh restart >/dev/null 2>&1 || true
    /opt/mchs-provisioning/provision.sh >/dev/null 2>&1 || true
  fi

  sleep "$INTERVAL"
done
