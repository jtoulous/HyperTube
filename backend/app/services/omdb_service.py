import httpx
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

OMDB_BASE = "http://www.omdbapi.com/"


class OmdbService:
    """
    Fetches movie/series details from the OMDB API using an IMDb ID.
    """

    @property
    def _api_key(self) -> str:
        return settings.OMDB_API_KEY

    async def get_by_imdb(self, imdb_id: str) -> Optional[dict]:
        """
        Fetch full details for a given IMDb ID.
        Returns a normalized dict or None on failure.
        """
        api_key = self._api_key
        if not imdb_id:
            logger.warning("get_by_imdb called with empty imdb_id")
            return None
        if not api_key:
            logger.error("OMDB_API_KEY is not configured — cannot fetch details")
            return None

        params = {
            "apikey": api_key,
            "i": imdb_id,
            "plot": "full",
        }

        logger.info(f"OMDB request: {imdb_id} (key={'yes' if api_key else 'MISSING'})")

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(OMDB_BASE, params=params)
                logger.info(f"OMDB response status: {resp.status_code}")
                resp.raise_for_status()
                data = resp.json()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            logger.error(f"OMDB request error for {imdb_id}: {e}")
            return None

        if data.get("Response") == "False":
            logger.warning(f"OMDB returned error for {imdb_id}: {data.get('Error')}")
            return None

        logger.info(f"OMDB returned: {data.get('Title', '?')} ({data.get('Year', '?')})")

        return {
            "imdb_id": data.get("imdbID"),
            "title": data.get("Title"),
            "year": data.get("Year"),
            "rated": data.get("Rated"),
            "released": data.get("Released"),
            "runtime": data.get("Runtime"),
            "genre": data.get("Genre"),
            "director": data.get("Director"),
            "writer": data.get("Writer"),
            "actors": data.get("Actors"),
            "plot": data.get("Plot"),
            "language": data.get("Language"),
            "country": data.get("Country"),
            "awards": data.get("Awards"),
            "poster": data.get("Poster"),
            "ratings": data.get("Ratings", []),
            "metascore": data.get("Metascore"),
            "imdb_rating": data.get("imdbRating"),
            "imdb_votes": data.get("imdbVotes"),
            "type": data.get("Type"),
            "total_seasons": data.get("totalSeasons"),
            "box_office": data.get("BoxOffice"),
        }
