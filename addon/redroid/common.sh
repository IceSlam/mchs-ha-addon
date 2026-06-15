#!/usr/bin/env bash
set -euo pipefail

OPTIONS_FILE="${CONFIG_PATH:-/data/options.json}"

opt() {
  local key="$1"
  local fallback="$2"
  if [ -f "$OPTIONS_FILE" ]; then
    jq -r --arg key "$key" --arg fallback "$fallback" '.[$key] // $fallback' "$OPTIONS_FILE"
  else
    printf '%s\n' "$fallback"
  fi
}

REDROID_IMAGE="$(opt redroid_image aureliolo/redroid:14.0.0_arm64_with_gapps)"
REDROID_REQUIRES_GMS="$(opt redroid_requires_gms true)"
REDROID_NAME="$(opt redroid_container_name mchs-redroid)"
REDROID_ADB_PORT="$(opt redroid_adb_port 5555)"
REDROID_USERDATA="$(opt redroid_userdata /data/redroid)"
REDROID_EXTRA_ARGS="$(opt redroid_extra_args '')"
ADB_TARGET="127.0.0.1:${REDROID_ADB_PORT}"

log() {
  printf '[redroid] %s\n' "$*"
}

docker_available() {
  docker version >/dev/null 2>&1
}

write_docker_unavailable_status() {
  mkdir -p /data/status
  jq -n '{
    docker_api: "unavailable",
    redroid: "stopped",
    adb: "offline",
    boot_completed: false,
    message: "Docker API unavailable. Add docker_api: true to addon/config.yaml and rebuild/reinstall the add-on."
  }' > /data/status/redroid.json
}

adb_connect() {
  adb connect "$ADB_TARGET" >/dev/null 2>&1 || true
}
