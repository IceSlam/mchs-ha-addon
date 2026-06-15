#!/usr/bin/with-contenv sh
set -eu

if [ -f /data/options.json ]; then
  export CONFIG_PATH=/data/options.json
fi

cd /opt/mchs-alert-bridge
exec node dist/index.js
