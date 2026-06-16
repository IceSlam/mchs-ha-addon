"""MCHS Alert binary sensor."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([MchsAlertBinarySensor(hass.data[DOMAIN][entry.entry_id])])


class MchsAlertBinarySensor(CoordinatorEntity, BinarySensorEntity):
    _attr_name = "MCHS Alert"
    _attr_unique_id = "mchs_alert"
    _attr_device_class = BinarySensorDeviceClass.SAFETY

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator)

    @property
    def is_on(self) -> bool:
        return self.coordinator.data.get("alert", {}).get("state") == "ON"

    @property
    def device_info(self):
        return {"identifiers": {(DOMAIN, "server")}, "name": "MCHS Alert Server"}
