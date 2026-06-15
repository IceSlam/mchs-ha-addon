#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/data/status" "$TMP/data/uploads" "$TMP/opt/mchs-provisioning/apks" "$TMP/opt/mchs-redroid"

cat > "$TMP/bin/adb" <<'EOF'
#!/usr/bin/env bash
if echo "$*" | grep -q 'pm path com.google.android.gms'; then exit 1; fi
if echo "$*" | grep -q 'pm path dev.mchsha.listener'; then exit 1; fi
if echo "$*" | grep -q 'pm list packages'; then echo 'package:android'; exit 0; fi
if echo "$*" | grep -q 'settings get secure enabled_notification_listeners'; then echo ''; exit 0; fi
exit 0
EOF
chmod +x "$TMP/bin/adb"

cat > "$TMP/bin/jq" <<'EOF'
#!/usr/bin/env bash
exec /usr/bin/jq "$@"
EOF
chmod +x "$TMP/bin/jq"

cat > "$TMP/opt/mchs-redroid/common.sh" <<EOF
OPTIONS_FILE="$TMP/options.json"
ADB_TARGET="127.0.0.1:5555"
REDROID_REQUIRES_GMS="true"
opt() { echo "\$2"; }
log() { printf '[test] %s\n' "\$*"; }
adb_connect() { true; }
EOF

cat > "$TMP/opt/mchs-redroid/manager.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$TMP/opt/mchs-redroid/manager.sh"

sed \
  -e "s#/opt/mchs-redroid#$TMP/opt/mchs-redroid#g" \
  -e "s#/opt/mchs-provisioning#$TMP/opt/mchs-provisioning#g" \
  -e "s#/data#$TMP/data#g" \
  "$ROOT/addon/provisioning/provision.sh" > "$TMP/provision.sh"
chmod +x "$TMP/provision.sh"

set +e
PATH="$TMP/bin:$PATH" "$TMP/provision.sh" > "$TMP/out.txt" 2>&1
code=$?
set -e

grep -q "Listener APK not found" "$TMP/out.txt"
test "$code" -eq 10
test -f "$TMP/data/status/provisioning.json"
grep -q '"status": "error"' "$TMP/data/status/provisioning.json"

echo "provisioning tests passed"
