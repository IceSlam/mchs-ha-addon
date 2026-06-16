"""MCHS Alert sensors."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

SENSORS = [
    ("mchs_alert_type", "MCHS Alert Type", ("alert", "type")),
    ("mchs_alert_region", "MCHS Alert Region", ("alert", "region")),
    ("mchs_alert_message", "MCHS Alert Message", ("alert", "message")),
    ("mchs_alert_last_seen", "MCHS Alert Last Seen", ("alert", "last_seen")),
    ("mchs_server_status", "MCHS Server Status", ("server",)),
    ("mchs_android_status", "MCHS Android Status", ("android", "status")),
    ("mchs_gms_status", "MCHS GMS Status", ("android", "gms")),
    ("mchs_listener_status", "MCHS Listener Status", ("android", "listener")),
    ("mchs_mchs_app_status", "MCHS App Status", ("android", "mchs")),
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([MchsAlertSensor(coordinator, unique_id, name, path) for unique_id, name, path in SENSORS])


class MchsAlertSensor(CoordinatorEntity, SensorEntity):
    def __init__(self, coordinator, unique_id: str, name: str, path: tuple[str, ...]) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = unique_id
        self._attr_name = name
        self._path = path

    @property
    def native_value(self) -> Any:
        value: Any = self.coordinator.data
        for item in self._path:
            if not isinstance(value, dict):
                return None
            value = value.get(item)
        return value

    @property
    def device_info(self):
        return {"identifiers": {(DOMAIN, "server")}, "name": "MCHS Alert Server"}
