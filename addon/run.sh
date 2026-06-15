#!/usr/bin/with-contenv bash
set -euo pipefail

export CONFIG_PATH=/data/options.json
export WEBUI_PORT="$(jq -r '.webui_port // 8099' "$CONFIG_PATH" 2>/dev/null || echo 8099)"

mkdir -p /data/uploads /data/redroid

pids=""

start_bg() {
  local name="$1"
  shift
  echo "[addon] starting ${name}"
  "$@" &
  pids="$pids $!"
}

shutdown() {
  echo "[addon] shutting down"
  for pid in $pids; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  wait || true
}
trap shutdown TERM INT

start_bg bridge sh -c 'cd /opt/mchs-alert-bridge && exec node dist/index.js'
start_bg webui python3 /opt/mchs-webui/server.py

(
  echo "[addon] ensuring redroid"
  /opt/mchs-redroid/manager.sh ensure || true
  echo "[addon] provisioning android"
  /opt/mchs-provisioning/provision.sh || true
) &
pids="$pids $!"

start_bg health-monitor /opt/mchs-redroid/health_monitor.sh

while true; do
  for pid in $pids; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "[addon] process $pid exited"
      shutdown
      exit 1
    fi
  done
  sleep 5
done
