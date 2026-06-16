# MCHS Alert Server

Runs Redroid Android, provisioning, Web UI, and the MCHS alert bridge outside Home Assistant.

## Quick Start

```bash
cp .env.example .env
# edit REDROID_IMAGE and API_TOKEN
docker compose up -d
```

Open:

```text
http://SERVER_IP:8765
```

## Setup Flow

1. Upload `mchs-listener.apk` if the release bundle does not already include it.
2. Upload the official МЧС России APK obtained from a legal source.
3. Click `Run provisioning`.
4. Open `Android UI`.
5. Configure the MCHS app region and notification permissions.
6. Grant Notification Access to the listener.
7. Send a test alert.

## GMS / FCM

Set `REDROID_IMAGE` to an amd64 Redroid image with working Google Play Services. The repository does not include Google apps or GApps ZIP files.

If `/api/system/gms` returns `missing`, push notifications may not work.

## Useful Commands

```bash
docker compose logs -f bridge
docker compose logs -f redroid
curl -H "Authorization: Bearer $API_TOKEN" http://localhost:8765/api/status
curl -X POST -H "Authorization: Bearer $API_TOKEN" http://localhost:8765/api/test/uav
```

## APK Paths

```text
server/apks/listener/mchs-listener.apk
server/apks/mchs/mchs.apk
```

Provisioning installs APKs from these mounted paths inside the bridge container:

```text
/data/apks/listener/mchs-listener.apk
/data/apks/mchs/mchs.apk
```
