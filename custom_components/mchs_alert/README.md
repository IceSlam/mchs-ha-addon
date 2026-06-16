# MCHS Alert custom integration

This integration connects Home Assistant to an external MCHS Alert Server over HTTP.

Fields:

- `host`: server IP or DNS name;
- `port`: default `8765`;
- `token`: optional API token from server `.env`;
- `use_ssl`: enable if the server is behind HTTPS reverse proxy;
- `scan_interval`: polling interval in seconds;
- `use_sse`: subscribe to `/api/events/stream`; polling is always used as fallback.

Created entities:

- `binary_sensor.mchs_alert`
- `sensor.mchs_alert_type`
- `sensor.mchs_alert_region`
- `sensor.mchs_alert_message`
- `sensor.mchs_alert_last_seen`
- `sensor.mchs_server_status`
- `sensor.mchs_android_status`
- `sensor.mchs_gms_status`
- `sensor.mchs_listener_status`
- `sensor.mchs_mchs_app_status`
