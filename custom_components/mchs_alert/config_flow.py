"""Config flow for MCHS Alert."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from . import DOMAIN

CONF_TOPIC_PREFIX = "topic_prefix"
DEFAULT_TOPIC_PREFIX = "mchs/alerts"


class MchsAlertConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for MCHS Alert."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            await self.async_set_unique_id("mchs_alert_mqtt")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="MCHS Alert", data=user_input)

        schema = vol.Schema({vol.Optional(CONF_TOPIC_PREFIX, default=DEFAULT_TOPIC_PREFIX): str})
        return self.async_show_form(step_id="user", data_schema=schema, errors={})
