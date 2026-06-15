"""MQTT-backed MCHS alert binary sensor."""

from __future__ import annotations

from homeassistant.components import mqtt
from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .config_flow import DEFAULT_TOPIC_PREFIX, CONF_TOPIC_PREFIX


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    topic_prefix = entry.data.get(CONF_TOPIC_PREFIX, DEFAULT_TOPIC_PREFIX)
    entity = MchsAlertBinarySensor(topic_prefix)
    async_add_entities([entity])
    await entity.async_subscribe(hass)


class MchsAlertBinarySensor(BinarySensorEntity):
    _attr_name = "MCHS Alert"
    _attr_unique_id = "mchs_alert_custom_binary"
    _attr_device_class = BinarySensorDeviceClass.SAFETY

    def __init__(self, topic_prefix: str) -> None:
        self._topic_prefix = topic_prefix.rstrip("/")
        self._attr_is_on = False

    async def async_subscribe(self, hass: HomeAssistant) -> None:
        @callback
        def message_received(msg) -> None:
            self._attr_is_on = msg.payload == "ON"
            self.async_write_ha_state()

        await mqtt.async_subscribe(hass, f"{self._topic_prefix}/state", message_received, 1)
