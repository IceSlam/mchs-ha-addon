"""HTTP client for MCHS Alert Server."""

from __future__ import annotations

from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout


class MchsAlertApiClient:
    def __init__(self, session: ClientSession, host: str, port: int, token: str | None, use_ssl: bool) -> None:
        scheme = "https" if use_ssl else "http"
        self._base_url = f"{scheme}://{host}:{port}"
        self._session = session
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}

    async def status(self) -> dict[str, Any]:
        return await self._get("/api/status")

    async def event_stream(self):
        return self._session.get(
            f"{self._base_url}/api/events/stream",
            headers=self._headers,
            timeout=ClientTimeout(total=None),
        )

    async def _get(self, path: str) -> dict[str, Any]:
        try:
            async with self._session.get(f"{self._base_url}{path}", headers=self._headers, timeout=10) as response:
                if response.status == 401:
                    return {"ok": False, "server": "auth_failed"}
                response.raise_for_status()
                return await response.json()
        except ClientError as err:
            return {"ok": False, "server": "unavailable", "error": str(err)}
        except TimeoutError:
            return {"ok": False, "server": "unavailable", "error": "timeout"}
