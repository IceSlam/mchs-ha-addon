"""MQTT-backed MCHS alert sensors."""

from __future__ import annotations

from homeassistant.components import mqtt
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

SENSORS = [
    ("mchs_alert_type_custom", "MCHS Alert Type", "mchs/alerts/type"),
    ("mchs_alert_region_custom", "MCHS Alert Region", "mchs/alerts/region"),
    ("mchs_alert_message_custom", "MCHS Alert Message", "mchs/alerts/message"),
    ("mchs_alert_last_seen_custom", "MCHS Alert Last Seen", "mchs/alerts/last_seen")
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entities = [MchsAlertSensor(unique_id, name, topic) for unique_id, name, topic in SENSORS]
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
