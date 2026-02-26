import httpx
import logging
import xml.etree.ElementTree as ET
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

TORZNAB_NS = "http://torznab.com/schemas/2015/feed"


class JackettService:
    """
    Queries Jackett's Torznab API to search torrents across all configured indexers.
    """

    def __init__(self):
        self._base = settings.JACKETT_URL.rstrip("/")
        self._api_key = settings.JACKETT_API_KEY

    async def search(self, query: str, categories: str = "", offset: int = 0, limit: int = 100) -> list[dict]:
        """
        Search across all Jackett indexers.
        Returns a list of parsed torrent results.
        offset/limit are passed to Jackett for true pagination.
        """
        params = {
            "apikey": self._api_key,
            "q": query,
            "limit": limit,
            "offset": offset,
        }
        if categories:
            params["cat"] = categories

        url = f"{self._base}/api/v2.0/indexers/all/results/torznab/api"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(f"Jackett HTTP error: {e.response.status_code}")
            return []
        except httpx.RequestError as e:
            logger.error(f"Jackett request error: {e}")
            return []

        return self._parse_torznab_xml(resp.text)

    def _parse_torznab_xml(self, xml_text: str) -> list[dict]:
        """Parse Torznab XML response into a list of dicts."""
        results = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.error(f"Failed to parse Jackett XML: {e}")
            return []

        channel = root.find("channel")
        if channel is None:
            return []

        for item in channel.findall("item"):
            result = {
                "title": self._text(item, "title"),
                "link": self._text(item, "link"),
                "description": self._text(item, "description"),
                "pub_date": self._text(item, "pubDate"),
                "size": self._attr_val(item, "size"),
                "seeders": self._attr_val(item, "seeders"),
                "peers": self._attr_val(item, "peers"),
                "imdbid": self._normalize_imdb(self._attr_val(item, "imdbid")),
                "category": self._text(item, "category"),
                "magneturl": self._find_magnet(item),
                "indexer": self._text(item, "jackettindexer") or self._text(item, "{http://jackett.github.io/}indexer"),
            }

            # Try to get indexer from Jackett-specific element
            indexer_el = item.find("{http://jackett.github.io/}indexer")
            if indexer_el is not None:
                result["indexer"] = indexer_el.text or indexer_el.get("id", "")

            # Parse size to int
            if result["size"]:
                try:
                    result["size"] = int(result["size"])
                except (ValueError, TypeError):
                    result["size"] = 0
            else:
                # Try enclosure length
                enclosure = item.find("enclosure")
                if enclosure is not None:
                    try:
                        result["size"] = int(enclosure.get("length", 0))
                    except (ValueError, TypeError):
                        result["size"] = 0
                else:
                    result["size"] = 0

            # Parse seeders/peers to int
            for key in ("seeders", "peers"):
                if result[key]:
                    try:
                        result[key] = int(result[key])
                    except (ValueError, TypeError):
                        result[key] = 0
                else:
                    result[key] = 0

            results.append(result)

        # Sort by seeders descending
        results.sort(key=lambda r: r.get("seeders", 0), reverse=True)
        return results

    def _text(self, item, tag: str) -> Optional[str]:
        """Get text of a child element."""
        el = item.find(tag)
        if el is not None and el.text:
            return el.text.strip()
        return None

    def _attr_val(self, item, attr_name: str) -> Optional[str]:
        """Get value from torznab:attr elements."""
        for attr in item.findall(f"{{{TORZNAB_NS}}}attr"):
            if attr.get("name") == attr_name:
                return attr.get("value")
        # Also check newznab namespace
        for attr in item.findall("{http://www.newznab.com/DTD/2010/feeds/attributes/}attr"):
            if attr.get("name") == attr_name:
                return attr.get("value")
        return None

    def _find_magnet(self, item) -> Optional[str]:
        """Extract magnet link from item."""
        # Check link first
        link = self._text(item, "link")
        if link and link.startswith("magnet:"):
            return link

        # Check enclosure
        enclosure = item.find("enclosure")
        if enclosure is not None:
            url = enclosure.get("url", "")
            if url.startswith("magnet:"):
                return url

        # Check torznab magneturl attr
        magneturl = self._attr_val(item, "magneturl")
        if magneturl:
            return magneturl

        return None

    def _normalize_imdb(self, imdb_id: Optional[str]) -> Optional[str]:
        """Ensure imdbid always has the 'tt' prefix, or return None."""
        if not imdb_id:
            return None
        imdb_id = imdb_id.strip()
        if not imdb_id:
            return None
        if not imdb_id.startswith("tt"):
            imdb_id = "tt" + imdb_id
        return imdb_id
