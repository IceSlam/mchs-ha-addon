#!/usr/bin/env bash
set -euo pipefail
. /opt/mchs-redroid/common.sh

cmd="${1:-ensure}"

container_id() {
  docker ps -aq --filter "name=^/${REDROID_NAME}$" | head -n 1
}

container_running() {
  [ -n "$(docker ps -q --filter "name=^/${REDROID_NAME}$" | head -n 1)" ]
}

start_redroid() {
  if ! docker_available; then
    log "docker api unavailable; enable docker_api for this add-on"
    exit 2
  fi

  local diagnostics
  diagnostics="$(/opt/mchs-redroid/diagnostics.sh 2>/dev/null || echo '{"redroid_ready":false}')"
  if [ "$(echo "$diagnostics" | jq -r '.redroid_ready')" != "true" ]; then
    log "Redroid cannot start because binder/binderfs is not available on this host kernel: $diagnostics"
    mkdir -p /data/status
    echo "$diagnostics" > /data/status/kernel.json
    exit 3
  fi

  mkdir -p "$REDROID_USERDATA"

  if container_running; then
    log "container already running"
    return
  fi

  local existing
  existing="$(container_id)"
  if [ -n "$existing" ]; then
    log "starting existing container ${REDROID_NAME}"
    docker start "$REDROID_NAME" >/dev/null
    return
  fi

  log "creating container ${REDROID_NAME} from ${REDROID_IMAGE}"
  # Redroid requires binder/ashmem support on the host kernel. The broad /dev
  # mapping is intentional for RK3399 supervised installations where binder
  # devices vary by kernel package.
  docker run -d \
    --name "$REDROID_NAME" \
    --privileged \
    --restart unless-stopped \
    --network host \
    -v "${REDROID_USERDATA}:/data" \
    ${REDROID_EXTRA_ARGS} \
    "$REDROID_IMAGE" \
    androidboot.redroid_width=720 \
    androidboot.redroid_height=1280 \
    androidboot.redroid_dpi=320 >/dev/null
}

stop_redroid() {
  if container_running; then
    log "stopping container"
    docker stop "$REDROID_NAME" >/dev/null
  fi
}

restart_redroid() {
  stop_redroid || true
  start_redroid
}

wait_adb() {
  local timeout="${1:-180}"
  local end=$((SECONDS + timeout))
  while [ "$SECONDS" -lt "$end" ]; do
    adb_connect
    if adb -s "$ADB_TARGET" get-state >/dev/null 2>&1; then
      log "adb connected"
      return 0
    fi
    sleep 2
  done
  log "adb timeout"
  return 1
}

wait_boot() {
  local timeout="${1:-300}"
  local end=$((SECONDS + timeout))
  wait_adb "$timeout"
  while [ "$SECONDS" -lt "$end" ]; do
    if [ "$(adb -s "$ADB_TARGET" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      log "android boot completed"
      return 0
    fi
    sleep 3
  done
  log "boot timeout"
  return 1
}

health() {
  local running="stopped"
  local adb_state="offline"
  local boot="0"
  container_running && running="running"
  adb_connect
  adb -s "$ADB_TARGET" get-state >/dev/null 2>&1 && adb_state="connected"
  boot="$(adb -s "$ADB_TARGET" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  local diagnostics
  diagnostics="$(/opt/mchs-redroid/diagnostics.sh 2>/dev/null || echo '{}')"
  jq -n \
    --arg running "$running" \
    --arg adb "$adb_state" \
    --arg boot "${boot:-0}" \
    --arg target "$ADB_TARGET" \
    --argjson kernel "$diagnostics" \
    '{redroid:$running, adb:$adb, boot_completed:$boot, adb_target:$target, kernel:$kernel}'
}

case "$cmd" in
  ensure) start_redroid; wait_boot ;;
  start) start_redroid ;;
  stop) stop_redroid ;;
  restart) restart_redroid; wait_boot ;;
  wait-adb) wait_adb "${2:-180}" ;;
  wait-boot) wait_boot "${2:-300}" ;;
  health) health ;;
  diagnostics) /opt/mchs-redroid/diagnostics.sh ;;
  ip) docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$REDROID_NAME" ;;
  *) echo "usage: manager.sh ensure|start|stop|restart|wait-adb|wait-boot|health|ip" >&2; exit 64 ;;
esac
