# MCHS Alert Add-on

This add-on runs:

- MQTT bridge;
- Redroid Android manager;
- APK provisioning;
- setup Web UI;
- health monitor/watchdog.

It is designed for Home Assistant Supervised on ARM64 hosts such as Orange Pi 4 Pro / RK3399 with Docker and a kernel that supports Redroid binder requirements.

The add-on requires `docker_api: true` because it starts a sibling `redroid/redroid` container. Android userdata is persisted at `/data/redroid`.

Open the add-on Web UI to upload the MCHS APK, run provisioning, open Notification Access settings and check Redroid/ADB/listener status.
