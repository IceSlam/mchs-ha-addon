#!/usr/bin/env bash
set -euo pipefail

device_exists() {
  [ -e "$1" ] && echo "present" || echo "missing"
}

module_loaded() {
  local name="$1"
  if lsmod 2>/dev/null | awk '{print $1}' | grep -qx "$name"; then
    echo "present"
  else
    echo "missing"
  fi
}

binderfs_status() {
  if mount | grep -q ' type binder '; then
    echo "present"
  elif mount | grep -q 'binderfs'; then
    echo "present"
  else
    echo "missing"
  fi
}

memfd_status() {
  if grep -q memfd /proc/filesystems 2>/dev/null || [ -e /proc/sys/vm/memfd_noexec ]; then
    echo "present"
  else
    echo "unknown"
  fi
}

jq -n \
  --arg binder "$(device_exists /dev/binder)" \
  --arg vndbinder "$(device_exists /dev/vndbinder)" \
  --arg hwbinder "$(device_exists /dev/hwbinder)" \
  --arg binderfs "$(binderfs_status)" \
  --arg binder_module "$(module_loaded binder_linux)" \
  --arg ashmem "$(device_exists /dev/ashmem)" \
  --arg memfd "$(memfd_status)" \
  '{
    binder: $binder,
    vndbinder: $vndbinder,
    hwbinder: $hwbinder,
    binderfs: $binderfs,
    binder_module: $binder_module,
    ashmem: $ashmem,
    memfd: $memfd,
    redroid_ready: (($binder == "present" and $vndbinder == "present" and $hwbinder == "present") or $binderfs == "present")
  }'
