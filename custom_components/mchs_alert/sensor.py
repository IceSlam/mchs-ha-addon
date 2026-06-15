"""MQTT-backed MCHS alert sensors."""

from __future__ import annotations

from homeassistant.components import mqtt
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .config_flow import DEFAULT_TOPIC_PREFIX, CONF_TOPIC_PREFIX

SENSORS = [
    ("mchs_alert_type_custom", "MCHS Alert Type", "type"),
    ("mchs_alert_region_custom", "MCHS Alert Region", "region"),
    ("mchs_alert_message_custom", "MCHS Alert Message", "message"),
    ("mchs_alert_last_seen_custom", "MCHS Alert Last Seen", "last_seen"),
    ("mchs_alert_last_event_type_custom", "MCHS Alert Last Event Type", "last_event_type"),
    ("mchs_alert_last_event_message_custom", "MCHS Alert Last Event Message", "last_event_message"),
    ("mchs_alert_last_event_seen_custom", "MCHS Alert Last Event Seen", "last_event_seen"),
    ("mchs_alert_listener_status_custom", "MCHS Alert Listener Status", "listener_status"),
    ("mchs_alert_bridge_status_custom", "MCHS Alert Bridge Status", "bridge_status")
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    topic_prefix = entry.data.get(CONF_TOPIC_PREFIX, DEFAULT_TOPIC_PREFIX).rstrip("/")
    entities = [MchsAlertSensor(unique_id, name, f"{topic_prefix}/{topic}") for unique_id, name, topic in SENSORS]
    async_add_entities(entities)
    for entity in entities:
        await entity.async_subscribe(hass)


class MchsAlertSensor(SensorEntity):
    def __init__(self, unique_id: str, name: str, topic: str) -> None:
        self._attr_unique_id = unique_id
        self._attr_name = name
        self._topic = topic
        self._attr_native_value = None

    async def async_subscribe(self, hass: HomeAssistant) -> None:
        @callback
        def message_received(msg) -> None:
            self._attr_native_value = msg.payload
            self.async_write_ha_state()

        await mqtt.async_subscribe(hass, self._topic, message_received, 1)
