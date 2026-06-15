# mchs-ha-addon

Home Assistant add-on for running Android inside Redroid, installing a Notification Listener APK, receiving notifications from the official "МЧС России" Android app, and publishing alert state to Home Assistant through MQTT.

No separate Android smartphone is required.

The project is not an official alerting channel. Use several independent sources for critical scenarios.

## Architecture

```text
Home Assistant Supervised
├── MCHS Alert Add-on
│   ├── MQTT Bridge
│   ├── Redroid Manager
│   ├── APK Provisioner
│   ├── Web UI
│   └── Health Monitor
└── Redroid Android 13 Container
    ├── Google Play Services
    ├── МЧС России
    └── MCHS Notification Listener
```

The add-on does not intercept traffic, does not reverse engineer the MCHS app, does not bypass protection, and does not include the MCHS APK. It reads Android system notifications only through Android Notification Access.

## Requirements

```text
Home Assistant Supervised
Debian host
Docker
ARM64 host, tested target: Orange Pi 4 Pro / RK3399
Kernel with binder/binderfs support
Mosquitto Broker
```

The add-on supports `aarch64`. On Orange Pi 4 Pro / ARM64, Home Assistant Supervisor builds it from:

```text
ghcr.io/home-assistant/aarch64-base:3.21
```

The Dockerfile intentionally has no `amd64-base` fallback; Supervisor passes the correct `BUILD_FROM` value from `addon/config.yaml`.

Google Play Services / FCM are usually required for reliable push notifications. If GMS is missing, the Web UI shows:

```text
Google Play Services not detected. Push notifications may not work.
```

Use an ARM64 Redroid image with GMS if your MCHS app build depends on FCM.

## Quick Install

1. Install Mosquitto Broker in Home Assistant.
2. Add this repository as an add-on repository.
3. Install `MCHS Alert`.
4. Set `region`, for example `Брянская область`.
5. Start the add-on.
6. Open add-on Web UI.
7. Upload the official MCHS APK obtained from a legal source.
8. Click `Run Provisioning`.
9. Open Android UI.
10. In the MCHS app, select region and allow notifications.
11. Grant Notification Access to `MCHS Alert Listener`.
12. Click `Send test UAV alert`.
13. Create Home Assistant automations.

## Home Assistant Add-on Repository

The repository contains:

```text
repository.yaml
addon/config.yaml
addon/Dockerfile
addon/README.md
addon/run.sh
```

`repository.yaml`:

```yaml
name: MCHS Alert Add-ons
url: https://github.com/IceSlam/mchs-ha-addon
maintainer: IceSlam
```

## Listener APK

The listener APK is built by GitHub Actions and copied into:

```text
addon/provisioning/apks/mchs-listener.apk
```

Release/bundle artifacts contain the listener APK already embedded. If you use a source checkout without the bundled APK, upload `mchs-listener.apk` in the Web UI.

Artifact path:

```text
Actions -> successful workflow -> Artifacts -> mchs-listener.apk
```

## MCHS APK

The MCHS APK is not included. Obtain it yourself from a legal source and upload it in the add-on Web UI. The add-on installs it with ADB automatically.

## Orange Pi 4 Pro Diagnostics

Redroid requires binder devices or binderfs. The add-on checks this automatically and reports missing kernel support in logs and Web UI.

Manual diagnostics:

```bash
ls /dev/binder
ls /dev/vndbinder
ls /dev/hwbinder
mount | grep binder
lsmod | grep binder
ls /dev/ashmem
```

If binder/binderfs is unavailable:

```text
Redroid cannot start because binder/binderfs is not available on this host kernel.
```

## Web UI

The Web UI shows:

```text
Bridge status
MQTT status
Redroid status
Android boot status
ADB status
Listener APK status
MCHS APK status
GMS status
Notification access status
Last notification
Last alert
```

Buttons:

```text
Start Android
Restart Android
Run Provisioning
Upload MCHS APK
Upload Listener APK
Open Android UI
Open Notification Access settings
Open MCHS app
Send test UAV alert
Send test cancel alert
```

Android UI is exposed through the `android-ui` Web UI route: open the add-on Web UI and click `Open Android UI`. The built-in UI uses ADB screenshots plus browser tap/text controls, so the first setup can be completed without an external Android device. A low-latency scrcpy-web/noVNC backend can still be added later, but it is not required for the MVP flow.

Android UI status API:

```text
GET api/android-ui/status
```

## MQTT Discovery

MQTT Discovery creates:

```text
binary_sensor.mchs_alert
sensor.mchs_alert_type
sensor.mchs_alert_region
sensor.mchs_alert_message
sensor.mchs_alert_last_seen
sensor.mchs_android_status
sensor.mchs_listener_status
sensor.mchs_bridge_status
sensor.mchs_mqtt_status
sensor.mchs_gms_status
sensor.mchs_provisioning_status
```

System topics:

```text
mchs/system/android
mchs/system/listener
mchs/system/bridge
mchs/system/mqtt
mchs/system/gms
mchs/system/provisioning
```

## Checks

```bash
curl http://HOME_ASSISTANT_IP:8765/health
curl http://HOME_ASSISTANT_IP:8765/status
curl -X POST http://HOME_ASSISTANT_IP:8765/test/uav
curl -X POST http://HOME_ASSISTANT_IP:8765/test/cancel
```

## Automations

Notification:

```yaml
alias: МЧС — уведомление
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "on"
action:
  - service: persistent_notification.create
    data:
      title: "МЧС — тревога"
      message: "{{ states('sensor.mchs_alert_message') }}"
mode: single
```

Siren:

```yaml
alias: МЧС — сирена
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "on"
action:
  - service: switch.turn_on
    target:
      entity_id: switch.sirena
mode: single
```

Cancel:

```yaml
alias: МЧС — отбой
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "off"
action:
  - service: persistent_notification.create
    data:
      title: "МЧС — отбой"
      message: "{{ states('sensor.mchs_alert_message') }}"
mode: single
```

Night mode:

```yaml
alias: МЧС — ночной режим
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "on"
condition:
  - condition: time
    after: "23:00:00"
    before: "07:00:00"
action:
  - service: light.turn_on
    target:
      entity_id: light.bedroom
    data:
      brightness_pct: 25
      color_name: red
  - service: persistent_notification.create
    data:
      title: "МЧС — ночная тревога"
      message: "{{ states('sensor.mchs_alert_message') }}"
mode: single
```

## Custom Integration

Custom integration is optional. Do not install it if MQTT Discovery is enabled.

If you use `custom_components/mchs_alert`, set in add-on config:

```yaml
mqtt_discovery: false
```

## Development

```bash
cd addon/bridge
npm ci
npm run typecheck
npm run test
npm run build
```

```bash
bash addon/provisioning/tests/test_provisioning.sh
docker build -t mchs-alert-addon:test addon
```

```bash
cd android-listener
./gradlew clean assembleDebug
```
