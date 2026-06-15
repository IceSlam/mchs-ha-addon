# MCHS Alert Bridge add-on

This add-on exposes `POST /notification` on port `8765`, classifies Android notification text from the MCHS Russia app, and publishes Home Assistant MQTT topics and discovery payloads.

Version `0.1.0` supports external Android devices, emulators, or containers. Android-in-Docker is intentionally not enabled by default because it depends on host kernel binder/ashmem support and elevated privileges.

Endpoints:

- `GET /health`
- `GET /status`
- `POST /notification`
- `POST /test/uav`
- `POST /test/missile`
- `POST /test/air`
- `POST /test/cancel`
- `POST /test/unknown`
