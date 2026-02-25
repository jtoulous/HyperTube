import httpx
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


class TorrentService:
    """
    Wrapper around the qBittorrent Web API.

    Docs: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)

    Usage:
        async with TorrentService() as ts:
            await ts.add_magnet("magnet:?xt=...")
            torrents = await ts.list_torrents()
    """

    def __init__(self):
        self._base = settings.QBITTORRENT_URL.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None
        self._authenticated = False

    # ── context manager ──────────────────────────────────────────────

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=30)
        await self._login()
        return self

    async def __aexit__(self, *exc):
        if self._client:
            await self._client.aclose()

    # ── authentication ───────────────────────────────────────────────

    async def _login(self):
        """Authenticate with qBittorrent and store the session cookie."""
        resp = await self._client.post(
            f"{self._base}/api/v2/auth/login",
            data={
                "username": settings.QBITTORRENT_USER,
                "password": settings.QBITTORRENT_PASS,
            },
        )
        if resp.status_code != 200 or resp.text.strip() != "Ok.":
            logger.error(f"qBittorrent login failed: {resp.status_code} {resp.text}")
            raise ConnectionError("Cannot authenticate with qBittorrent")
        self._authenticated = True
        logger.info("Authenticated with qBittorrent")

    # ── helpers ──────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict = None):
        resp = await self._client.get(f"{self._base}{path}", params=params)
        resp.raise_for_status()
        return resp.json()

    async def _post(self, path: str, data: dict = None):
        resp = await self._client.post(f"{self._base}{path}", data=data)
        resp.raise_for_status()
        return resp

    # ── torrents ─────────────────────────────────────────────────────

    async def add_magnet(
        self,
        magnet_link: str,
        save_path: str = "/downloads",
        category: str = "",
        tags: str = "",
    ) -> bool:
        """
        Add a magnet link to qBittorrent.
        Returns True on success or if torrent already exists.
        """
        payload = {
            "urls": magnet_link,
            "savepath": save_path,
        }
        if category:
            payload["category"] = category
        if tags:
            payload["tags"] = tags

        resp = await self._post("/api/v2/torrents/add", data=payload)
        if resp.status_code == 200 and resp.text.strip() != "Fails.":
            logger.info(f"Magnet added: {magnet_link[:80]}…")
            return True

        # qBittorrent returns "Fails." when the torrent already exists in its list.
        # Verify by checking if the hash is already tracked.
        if "xt=urn:btih:" in magnet_link:
            try:
                torrent_hash = magnet_link.split("xt=urn:btih:")[1].split("&")[0].lower()
                existing = await self._get("/api/v2/torrents/info", params={"hashes": torrent_hash})
                if existing:
                    logger.info(f"Torrent already in qBittorrent: {torrent_hash}")
                    return True
            except Exception:
                pass

        logger.error(f"Failed to add magnet: {resp.text}")
        return False

    async def list_torrents(
        self,
        filter: str = "all",
        category: str = "",
        sort: str = "added_on",
        reverse: bool = True,
        limit: int = 0,
        offset: int = 0,
        hashes: str = "",
    ) -> list[dict]:
        """
        List torrents. `filter` can be: all, downloading, seeding, completed,
        paused, active, inactive, stalled, errored, etc.
        """
        params = {"filter": filter, "sort": sort, "reverse": str(reverse).lower()}
        if category:
            params["category"] = category
        if limit:
            params["limit"] = limit
        if offset:
            params["offset"] = offset
        if hashes:
            params["hashes"] = hashes
        return await self._get("/api/v2/torrents/info", params=params)

    async def get_torrent(self, torrent_hash: str) -> dict:
        """Get generic properties of a torrent."""
        return await self._get("/api/v2/torrents/properties", params={"hash": torrent_hash})

    async def get_progress(self, torrent_hash: str) -> dict:
        """
        Convenience method: return hash, name, progress (0-1), state,
        download speed, eta, size.
        """
        torrents = await self.list_torrents(hashes=torrent_hash)
        if not torrents:
            return None
        t = torrents[0]
        return {
            "hash": t["hash"],
            "name": t["name"],
            "progress": t["progress"],          # 0.0 → 1.0
            "state": t["state"],
            "dlspeed": t["dlspeed"],             # bytes/s
            "eta": t["eta"],                     # seconds, 8640000 = ∞
            "size": t["size"],
            "downloaded": t["downloaded"],
            "save_path": t["save_path"],
        }

    async def get_files(self, torrent_hash: str) -> list[dict]:
        """List files inside a torrent."""
        return await self._get("/api/v2/torrents/files", params={"hash": torrent_hash})

    async def pause(self, torrent_hash: str):
        """Pause a torrent."""
        await self._post("/api/v2/torrents/pause", data={"hashes": torrent_hash})

    async def resume(self, torrent_hash: str):
        """Resume a torrent."""
        await self._post("/api/v2/torrents/resume", data={"hashes": torrent_hash})

    async def delete(self, torrent_hash: str, delete_files: bool = True):
        """Delete a torrent. By default also removes downloaded data."""
        await self._post(
            "/api/v2/torrents/delete",
            data={"hashes": torrent_hash, "deleteFiles": str(delete_files).lower()},
        )
