# ha-mchs-alert

Home Assistant add-on, MQTT bridge, and Android Notification Listener APK for alerts delivered by the Android application "МЧС России".

The project does not reverse engineer the MCHS app, intercept traffic, bypass protections, or modify the app. The Android component only reads system notifications through the official Android `NotificationListenerService` after the user grants notification access.

## Architecture

```text
Android device / emulator / container
-> МЧС России app
-> MCHS Alert Listener APK
-> HTTP POST /notification
-> bridge service
-> MQTT
-> Home Assistant entities and automations
```

Version `0.1.0` supports `android_mode: external`: Android runs separately and sends events to the add-on. A redroid-style Android-in-Docker mode is intentionally left experimental because it depends on host kernel binder/ashmem support and privileged runtime settings.

## Why there is no MCHS API

This project intentionally avoids private APIs and traffic interception. It uses only notification text that Android already exposes to a user-approved notification listener.

## Repository Layout

```text
addon/                 Home Assistant add-on metadata and container entrypoint
android-listener/      Kotlin Android NotificationListenerService app
bridge/                TypeScript HTTP to MQTT bridge
custom_components/     Optional MQTT-backed Home Assistant integration
```

## Add-on Setup

Build from the repository root:

```bash
docker build -f addon/Dockerfile .
```

For Home Assistant add-on installation, add this repository as a local/custom add-on repository and configure:

```yaml
mqtt_host: core-mosquitto
mqtt_port: 1883
mqtt_username: ""
mqtt_password: ""
region: "Брянская область"
regions:
  - "Брянская область"
android_mode: "external"
listener_http_port: 8765
keywords:
  uav:
    - "беспилотная опасность"
    - "БПЛА"
    - "угроза атаки БПЛА"
  missile:
    - "ракетная опасность"
    - "ракетная угроза"
  air:
    - "воздушная тревога"
    - "авиационная опасность"
  cancel:
    - "отбой"
    - "опасность отменена"
    - "отмена опасности"
```

The add-on listens on `POST http://<home-assistant-host>:8765/notification`.

## Android APK

Build the APK from `android-listener/` with Android Studio or Gradle:

```bash
cd android-listener
./gradlew assembleDebug
```

Install the APK on the Android device, emulator, or container that also has the "МЧС России" app installed.

To find the actual package name:

```bash
adb shell pm list packages | grep -i mchs
```

Open the listener app, set:

- bridge URL, for example `http://192.168.1.10:8765/notification`;
- MCHS package name found through ADB, default `ru.mchs.app`.

Then tap "Open notification access" and grant notification access to `MCHS Alert Listener`. Use "Send test event" to verify the bridge path.

If the listener runs inside the same Android network namespace as the bridge, `http://127.0.0.1:8765/notification` can work. For a separate phone or emulator, use the Home Assistant host IP address.

## MQTT Topics

The bridge publishes:

```text
mchs/alerts/state
mchs/alerts/type
mchs/alerts/region
mchs/alerts/message
mchs/alerts/raw
mchs/alerts/last_seen
```

`mchs/alerts/state` is `ON` for alert events and `OFF` for cancellation or unknown events.

Debug MQTT:

```bash
mosquitto_sub -h core-mosquitto -t 'mchs/#' -v
```

## Classification

Default event rules:

- `uav_alert`: `беспилотная опасность`, `БПЛА`, `угроза атаки БПЛА`
- `missile_alert`: `ракетная опасность`, `ракетная угроза`
- `air_alert`: `воздушная тревога`, `авиационная опасность`
- `cancel_alert`: `отбой`, `отмена опасности`, `опасность отменена`
- `unknown`: no keyword matched

All keywords can be changed in add-on options.

## Home Assistant Entities

MQTT discovery creates:

```text
binary_sensor.mchs_alert
sensor.mchs_alert_type
sensor.mchs_alert_region
sensor.mchs_alert_message
sensor.mchs_alert_last_seen
```

The optional `custom_components/mchs_alert` integration subscribes to the same MQTT topics. Use it only if you prefer explicit UI setup over MQTT discovery. A manual YAML alternative is documented in [custom_components/mchs_alert/README.md](/home/iceslam/PhpstormProjects/mchs-ha-addon/custom_components/mchs_alert/README.md).

## Automation Example

```yaml
alias: МЧС — тревога БПЛА или ракетная опасность
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "on"
condition: []
action:
  - service: notify.mobile_app_iphone
    data:
      title: "Опасность"
      message: "{{ states('sensor.mchs_alert_message') }}"
  - service: persistent_notification.create
    data:
      title: "МЧС"
      message: "{{ states('sensor.mchs_alert_message') }}"
mode: single
```

## Test HTTP Event

```bash
curl -X POST http://127.0.0.1:8765/notification \
  -H 'content-type: application/json' \
  -d '{"source":"mchs_android_app","package":"ru.mchs.app","title":"МЧС России","text":"Беспилотная опасность объявлена на территории Брянской области","bigText":"Беспилотная опасность объявлена на территории Брянской области","timestamp":1710000000000}'
```

## Privacy

The listener forwards notification fields to the configured bridge and does not persist notification content. The bridge publishes the raw event to MQTT for debugging, so keep MQTT access restricted.
