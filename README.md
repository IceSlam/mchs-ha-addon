# ha-mchs-alert

Home Assistant Supervised add-on for receiving MCHS Russia Android push notifications inside a local Redroid Android container and publishing alert state to MQTT/Home Assistant.

New architecture:

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
    └── Notification Listener
```

No external Android phone is required.

## Important Limits

This add-on manages a sibling `redroid/redroid` Docker container through the Home Assistant Supervised Docker API. The host must support Android binder/ashmem or binderfs. On Orange Pi 4 Pro / RK3399 this depends on the Debian kernel package and boot configuration.

Google Play Services are not bundled by this project. Use a Redroid image that includes working GMS, or install a compatible GMS setup yourself. The Web UI reports `google_play_services: missing` if GMS is absent.

The project does not reverse engineer the MCHS app, intercept traffic, use private APIs, bypass protection, or modify the MCHS app. It reads Android system notifications through the official Notification Access permission.

This project is not an official alerting channel. Use multiple confirmation sources for critical scenarios.

## User Flow

After installing the add-on, the user should only need to:

1. Install and start the add-on.
2. Open add-on Web UI.
3. Upload/install the official MCHS APK if it is not already present in the Redroid image.
4. Open Android UI/controls and authorize the MCHS app.
5. Grant Notification Access to `MCHS Alert Listener`.
6. Select region in add-on config.
7. Create Home Assistant automations.

Everything else is handled by the add-on:

- starts Redroid;
- waits for ADB and Android boot;
- installs listener APK from `addon/provisioning/apks/mchs-listener.apk`;
- installs uploaded MCHS APK from Web UI;
- opens Notification Listener settings;
- monitors Redroid/ADB/listener/MQTT;
- publishes MQTT Discovery entities.

## Add-on Config

```yaml
region: "Брянская область"
redroid_image: "redroid/redroid:13.0.0-latest"
redroid_container_name: "mchs-redroid"
redroid_adb_port: 5555
redroid_userdata: "/data/redroid"
mqtt_discovery: true
filter_by_region: true
```

Persistent Android data is mounted at `/data/redroid` for userdata, MCHS settings, FCM tokens and permissions.

## Web UI

Home Assistant -> MCHS Alert Add-on -> Open Web UI.

The Web UI exposes:

- Redroid/ADB/GMS/listener status;
- MCHS APK upload;
- provisioning trigger;
- Redroid restart;
- open Android Notification Access settings.

Graphical Android access requires a scrcpy/noVNC-compatible backend for the host. The current MVP provides the management hooks and reports display backend status. On production images this should be wired to a host-compatible scrcpy-web/noVNC service.

## MQTT Entities

MQTT Discovery creates:

```text
binary_sensor.mchs_alert
sensor.mchs_alert_type
sensor.mchs_alert_region
sensor.mchs_alert_message
sensor.mchs_android_status
sensor.mchs_listener_status
sensor.mchs_bridge_status
```

Topics:

```text
mchs/alerts/state
mchs/alerts/type
mchs/alerts/region
mchs/alerts/message
mchs/system/android
mchs/system/listener
mchs/system/bridge
```

## Watchdog

The health monitor checks:

- Redroid container running;
- ADB connected;
- `sys.boot_completed=1`;
- listener package installed;
- MQTT publishing path.

If Android is unhealthy, the watchdog restarts Redroid and runs provisioning again.

## Listener APK

The listener source remains in `android-listener/`, but it is no longer intended for a user phone. CI builds it as `mchs-alert-listener.apk`; place/release it as:

```text
addon/provisioning/apks/mchs-listener.apk
```

Inside Redroid it posts to:

```text
http://127.0.0.1:8765/notification
```

Redroid runs with host networking so this endpoint reaches the add-on bridge.

## Automation Example

```yaml
alias: МЧС — тревога
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

## Development Checks

```bash
cd addon/bridge
npm ci
npm run typecheck
npm run test
npm run build
```

```bash
docker build -t mchs-alert:addon addon
```

```bash
cd android-listener
./gradlew clean assembleDebug
```
