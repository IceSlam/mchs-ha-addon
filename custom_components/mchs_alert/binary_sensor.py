"""MQTT-backed MCHS alert binary sensor."""

from __future__ import annotations

from homeassistant.components import mqtt
from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entity = MchsAlertBinarySensor()
    async_add_entities([entity])
    await entity.async_subscribe(hass)


class MchsAlertBinarySensor(BinarySensorEntity):
    _attr_name = "MCHS Alert"
    _attr_unique_id = "mchs_alert_custom_binary"
    _attr_device_class = BinarySensorDeviceClass.SAFETY

    def __init__(self) -> None:
        self._attr_is_on = False

    async def async_subscribe(self, hass: HomeAssistant) -> None:
        @callback
        def message_received(msg) -> None:
            self._attr_is_on = msg.payload == "ON"
            self.async_write_ha_state()

        await mqtt.async_subscribe(hass, "mchs/alerts/state", message_received, 1)
