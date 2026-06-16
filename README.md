# mchs-ha-addon

MCHS Alert Server runs Android/Redroid on a separate Docker host and exposes MCHS alert state to Home Assistant through a custom integration.

The Home Assistant host no longer starts Redroid, does not need Docker API access, and does not need privileged add-on permissions.

## Architecture

```text
amd64/Xeon Docker server
├── Redroid Android
├── Google Play Services / FCM capable Android image
├── МЧС России Android app
├── MCHS Notification Listener APK
├── Bridge HTTP/SSE API
└── Web UI

Home Assistant
└── custom_components/mchs_alert
    └── HTTP/SSE connection to MCHS Alert Server
```

The project does not intercept traffic, does not reverse engineer the MCHS app, does not use private APIs, and does not bypass app protections. It reads Android system notifications only through the official Android Notification Access permission granted by the user.

This project is not an official alerting channel. Use several independent sources for critical scenarios.

## Server Installation on amd64/Xeon

Requirements:

```text
amd64 Linux server
Docker
Docker Compose
Kernel support required by Redroid
GMS/FCM-capable Redroid image
```

Start the server:

```bash
cd server
cp .env.example .env
# edit REDROID_IMAGE and API_TOKEN
docker compose up -d
```

Open:

```text
http://SERVER_IP:8765
```

Initial setup:

1. Upload `mchs-listener.apk` if it is not already included in the release bundle.
2. Upload the official МЧС России APK obtained from a legal source.
3. Click `Run provisioning`.
4. Open `Android UI`.
5. In the MCHS app, select the region and allow notifications.
6. Grant Notification Access to the listener.
7. Send a test UAV alert from the Web UI.

## Google Play Services / FCM

Push notifications usually require Google Play Services and FCM. Set `REDROID_IMAGE` in `server/.env` to an amd64 Redroid image that includes working GMS/MindTheGapps:

```env
REDROID_IMAGE=your-amd64-redroid-gms-image
REQUIRE_GMS=true
```

Google apps or GApps ZIP files are not included in this repository for licensing reasons. MicroG can be tested experimentally, but full GMS/MindTheGapps is the recommended path for push notifications.

Check GMS status:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://SERVER_IP:8765/api/system/gms
```

If GMS is missing, push notifications may not arrive.

## API

Status:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://SERVER_IP:8765/api/status
curl -H "Authorization: Bearer YOUR_TOKEN" http://SERVER_IP:8765/api/alert
curl -H "Authorization: Bearer YOUR_TOKEN" http://SERVER_IP:8765/api/events/recent
```

SSE stream:

```text
GET /api/events/stream
```

Tests:

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" http://SERVER_IP:8765/api/test/uav
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" http://SERVER_IP:8765/api/test/cancel
```

## Home Assistant Integration

Install the custom integration:

1. Copy `custom_components/mchs_alert` to your Home Assistant `config/custom_components/`.
2. Restart Home Assistant.
3. Go to `Settings -> Devices & services -> Add integration`.
4. Choose `MCHS Alert`.
5. Enter server host, port, token, SSL setting, scan interval, and SSE preference.

Created entities:

```text
binary_sensor.mchs_alert
sensor.mchs_alert_type
sensor.mchs_alert_region
sensor.mchs_alert_message
sensor.mchs_alert_last_seen
sensor.mchs_server_status
sensor.mchs_android_status
sensor.mchs_gms_status
sensor.mchs_listener_status
sensor.mchs_mchs_app_status
```

## Automations

Persistent notification:

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

## Repository Layout

```text
server/                  Docker Compose MCHS Alert Server
server/bridge/           TypeScript HTTP/SSE bridge and Web UI
server/provisioning/     ADB provisioning scripts
server/apks/listener/    Listener APK in release bundles
server/apks/mchs/        User-provided MCHS APK location
custom_components/       Home Assistant integration
android-listener/        Kotlin Notification Listener APK source
addon/                   Deprecated legacy add-on path
```

The legacy Home Assistant add-on path is no longer the recommended deployment model.

## Development

```bash
cd server/bridge
npm ci
npm run typecheck
npm run build
```

```bash
python3 -m py_compile custom_components/mchs_alert/*.py
docker compose -f server/docker-compose.yml config
```

```bash
cd android-listener
./gradlew clean assembleDebug
```
