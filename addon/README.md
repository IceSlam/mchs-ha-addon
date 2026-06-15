# MCHS Alert

Runs a Redroid Android container inside Home Assistant Supervised, provisions the MCHS Notification Listener APK, installs an uploaded MCHS APK, and publishes notification-derived alert state through MQTT Discovery.

Requirements:

- Home Assistant Supervised on Debian;
- Docker API access;
- ARM64 host with Redroid-compatible binder/binderfs kernel support;
- Mosquitto Broker;
- legal MCHS APK supplied by the user.

On `aarch64`, Supervisor uses `ghcr.io/home-assistant/aarch64-base:3.21` from `build_from`.

Open the Web UI after start. It shows Redroid, ADB, GMS, listener, MCHS and provisioning status, and provides APK upload and provisioning buttons.

The MCHS APK is not bundled. The listener APK is bundled in release artifacts as `addon/provisioning/apks/mchs-listener.apk`; if it is missing, upload it in Web UI.
