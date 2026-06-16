"""Config flow for MCHS Alert."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from .const import CONF_HOST, CONF_PORT, CONF_SCAN_INTERVAL, CONF_TOKEN, CONF_USE_SSL, CONF_USE_SSE, DEFAULT_PORT, DEFAULT_SCAN_INTERVAL, DOMAIN


class MchsAlertConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            await self.async_set_unique_id(f"{user_input[CONF_HOST]}:{user_input[CONF_PORT]}")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="MCHS Alert Server", data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_HOST): str,
                    vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
                    vol.Optional(CONF_TOKEN, default=""): str,
                    vol.Optional(CONF_USE_SSL, default=False): bool,
                    vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): int,
                    vol.Optional(CONF_USE_SSE, default=True): bool,
                }
            ),
            errors={},
        )
