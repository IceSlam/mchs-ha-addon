# MCHS Alert custom integration

This optional integration creates MQTT-backed Home Assistant entities for the topics published by the add-on.
If MQTT Discovery is enabled in the add-on, Home Assistant creates the same user-facing entities automatically and this integration is not needed.

The config flow allows setting `topic_prefix`; default is `mchs/alerts`.

- `binary_sensor.mchs_alert`
- `sensor.mchs_alert_type`
- `sensor.mchs_alert_region`
- `sensor.mchs_alert_message`
- `sensor.mchs_alert_last_seen`
- `sensor.mchs_alert_last_event_type`
- `sensor.mchs_alert_last_event_message`
- `sensor.mchs_alert_last_event_seen`
- `sensor.mchs_alert_listener_status`
- `sensor.mchs_alert_bridge_status`

MQTT discovery from the add-on is usually enough. Install this custom integration only if you prefer explicit integration setup through the Home Assistant UI.

Manual YAML alternative:

```yaml
mqtt:
  binary_sensor:
    - name: MCHS Alert
      unique_id: mchs_alert_yaml
      state_topic: mchs/alerts/state
      payload_on: "ON"
      payload_off: "OFF"
      device_class: safety
  sensor:
    - name: MCHS Alert Type
      unique_id: mchs_alert_type_yaml
      state_topic: mchs/alerts/type
    - name: MCHS Alert Region
      unique_id: mchs_alert_region_yaml
      state_topic: mchs/alerts/region
    - name: MCHS Alert Message
      unique_id: mchs_alert_message_yaml
      state_topic: mchs/alerts/message
    - name: MCHS Alert Last Seen
      unique_id: mchs_alert_last_seen_yaml
      state_topic: mchs/alerts/last_seen
```
