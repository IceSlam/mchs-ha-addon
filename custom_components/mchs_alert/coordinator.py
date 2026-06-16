"""Coordinator for MCHS Alert."""

from __future__ import annotations

import asyncio
from datetime import timedelta
import json
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .api import MchsAlertApiClient
from .const import CONF_HOST, CONF_PORT, CONF_SCAN_INTERVAL, CONF_TOKEN, CONF_USE_SSL, CONF_USE_SSE, DEFAULT_SCAN_INTERVAL, DOMAIN

LOGGER = logging.getLogger(__name__)


class MchsAlertCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self._hass = hass
        self._use_sse = entry.data.get(CONF_USE_SSE, True)
        self._stream_task: asyncio.Task | None = None
        self.api = MchsAlertApiClient(
            async_get_clientsession(hass),
            entry.data[CONF_HOST],
            entry.data[CONF_PORT],
            entry.data.get(CONF_TOKEN),
            entry.data.get(CONF_USE_SSL, False),
        )
        super().__init__(
            hass,
            LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        return await self.api.status()

    def async_start_stream(self) -> None:
        if self._use_sse and self._stream_task is None:
            self._stream_task = self._hass.async_create_task(self._listen_stream())

    async def async_stop_stream(self) -> None:
        if self._stream_task is not None:
            self._stream_task.cancel()
            try:
                await self._stream_task
            except asyncio.CancelledError:
                pass
            self._stream_task = None

    async def _listen_stream(self) -> None:
        while True:
            try:
                async with await self.api.event_stream() as response:
                    response.raise_for_status()
                    async for raw_line in response.content:
                        line = raw_line.decode("utf-8").strip()
                        if not line.startswith("data:"):
                            continue
                        alert = json.loads(line.removeprefix("data:").strip())
                        current = dict(self.data or {})
                        current["alert"] = alert
                        current["server"] = "online"
                        self.async_set_updated_data(current)
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001
                LOGGER.debug("MCHS Alert SSE stream failed: %s", err)
                await asyncio.sleep(5)
