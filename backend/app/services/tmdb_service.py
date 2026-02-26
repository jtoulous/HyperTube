import asyncio
import time
import httpx
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

# Rate limit: TMDB allows 40 req/s — we stay at 35 for safety margin
_RATE_LIMIT = 35
_RATE_WINDOW = 1.0  # seconds


class _RateLimiter:
    """Simple sliding-window rate limiter for async code."""

    def __init__(self, max_calls: int, window: float):
        self._max_calls = max_calls
        self._window = window
        self._timestamps: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self):
        while True:
            async with self._lock:
                now = time.monotonic()
                # Purge timestamps outside the window
                self._timestamps = [t for t in self._timestamps if now - t < self._window]
                if len(self._timestamps) < self._max_calls:
                    self._timestamps.append(now)
                    return
                # Calculate how long to wait
                wait = self._window - (now - self._timestamps[0])
            await asyncio.sleep(max(wait, 0.01))


class TmdbService:
    """
    Fetches movie/series details from the TMDB API using an IMDb ID.
    Includes an in-memory cache and a rate limiter (40 req/s TMDB limit).

    Supports both auth methods:
      - "Jeton d'accès en lecture à l'API" (Read Access Token / Bearer)
        → long eyJ… JWT — sent as Authorization: Bearer header
      - "Clé d'API" (API Key)
        → short hex string — sent as ?api_key= query parameter
    """

    def __init__(self):
        self._cache: dict[str, Optional[dict]] = {}
        self._rate_limiter = _RateLimiter(_RATE_LIMIT, _RATE_WINDOW)

    @property
    def _api_key(self) -> str:
        return settings.TMDB_API_KEY

    @property
    def _is_bearer_token(self) -> bool:
        """Detect whether the key is a v4 Bearer token (JWT) or a v3 API key."""
        return self._api_key.startswith("eyJ")

    def _auth_headers(self) -> dict:
        if self._is_bearer_token:
            return {"Authorization": f"Bearer {self._api_key}", "accept": "application/json"}
        return {"accept": "application/json"}

    def _auth_params(self) -> dict:
        if self._is_bearer_token:
            return {}
        return {"api_key": self._api_key}

    def _poster_url(self, path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        return f"{TMDB_IMAGE_BASE}{path}"

    async def _get(self, client: httpx.AsyncClient, url: str, params: dict | None = None) -> httpx.Response:
        """Rate-limited GET request."""
        await self._rate_limiter.acquire()
        merged = {**self._auth_params(), **(params or {})}
        resp = await client.get(url, headers=self._auth_headers(), params=merged)
        resp.raise_for_status()
        return resp

    def _normalize_brief(self, item: dict, media_type: str) -> dict:
        """Lightweight normalize for search/discover results (no full detail fetch)."""
        title = item.get("title") or item.get("name") or ""
        release_date = item.get("release_date") or item.get("first_air_date") or ""
        year = release_date[:4] if release_date else None
        vote_avg = item.get("vote_average")
        imdb_rating = str(round(vote_avg, 1)) if vote_avg else None
        return {
            "tmdb_id":    item.get("id"),
            "imdbid":     None,
            "title":      title,
            "year":       year,
            "poster":     self._poster_url(item.get("poster_path")),
            "imdb_rating": imdb_rating,
            "plot":       item.get("overview") or "",
            "type":       media_type,
            "genre_tags": [],
            "popularity": item.get("popularity", 0),
        }

    async def search_by_title(self, query: str, page: int = 1) -> list[dict]:
        """Search movies and TV shows by title using TMDB /search/multi."""
        if not query or not self._api_key:
            return []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await self._get(
                    client,
                    f"{TMDB_BASE}/search/multi",
                    {"query": query, "page": page, "include_adult": "false"},
                )
                data = resp.json()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            logger.error(f"TMDB search_by_title error for '{query}': {e}")
            return []

        results = []
        for item in data.get("results", []):
            media_type = item.get("media_type", "movie")
            if media_type not in ("movie", "tv"):
                continue
            brief = self._normalize_brief(item, media_type)
            if not brief["poster"]:
                continue
            results.append(brief)
        return results

    async def discover(
        self,
        genre_id: Optional[int] = None,
        sort_by: str = "popularity.desc",
        page: int = 1,
        date_gte: Optional[str] = None,
        date_lte: Optional[str] = None,
    ) -> list[dict]:
        """Discover movies via TMDB /discover/movie."""
        if not self._api_key:
            return []
        params: dict = {
            "sort_by":         sort_by,
            "page":            page,
            "include_adult":   "false",
            "vote_count.gte":  "30",
        }
        if genre_id:
            params["with_genres"] = str(genre_id)
        if date_gte:
            params["primary_release_date.gte"] = date_gte
        if date_lte:
            params["primary_release_date.lte"] = date_lte
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await self._get(client, f"{TMDB_BASE}/discover/movie", params)
                data = resp.json()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            logger.error(f"TMDB discover error: {e}")
            return []

        results = []
        for item in data.get("results", []):
            brief = self._normalize_brief(item, "movie")
            if not brief["poster"]:
                continue
            results.append(brief)
        return results

    async def get_by_imdb(self, imdb_id: str) -> Optional[dict]:
        """
        Look up a movie or TV show by IMDb ID via TMDB's /find endpoint,
        then fetch full details.  Returns a normalized dict or None.
        Results are cached in memory to avoid duplicate requests.
        """
        api_key = self._api_key
        if not imdb_id:
            logger.warning("get_by_imdb called with empty imdb_id")
            return None
        if not api_key:
            logger.error("TMDB_API_KEY is not configured — cannot fetch details")
            return None

        # ── Check cache ────────────────────────────────────────────────────
        if imdb_id in self._cache:
            logger.debug(f"TMDB cache hit: {imdb_id}")
            return self._cache[imdb_id]

        logger.info(f"TMDB find request: {imdb_id}")

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # Step 1 — find the TMDB id from the IMDb id
                find_resp = await self._get(
                    client,
                    f"{TMDB_BASE}/find/{imdb_id}",
                    {"external_source": "imdb_id"},
                )
                find_data = find_resp.json()

                # TMDB returns matches in typed arrays
                movie_results = find_data.get("movie_results", [])
                tv_results = find_data.get("tv_results", [])

                if movie_results:
                    tmdb_id = movie_results[0]["id"]
                    media_type = "movie"
                elif tv_results:
                    tmdb_id = tv_results[0]["id"]
                    media_type = "tv"
                else:
                    logger.warning(f"TMDB found no results for {imdb_id}")
                    self._cache[imdb_id] = None
                    return None

                # Step 2 — fetch full details + credits (single request)
                detail_resp = await self._get(
                    client,
                    f"{TMDB_BASE}/{media_type}/{tmdb_id}",
                    {"append_to_response": "credits"},
                )
                data = detail_resp.json()

        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            logger.error(f"TMDB request error for {imdb_id}: {e}")
            return None

        result = self._normalize(imdb_id, tmdb_id, media_type, data)
        self._cache[imdb_id] = result
        return result

    # ── Normalize TMDB response to our standard shape ──────────────────────

    def _normalize(self, imdb_id: str, tmdb_id: int, media_type: str, data: dict) -> dict:
        title = data.get("title") or data.get("name") or ""
        release_date = data.get("release_date") or data.get("first_air_date") or ""
        year = release_date[:4] if release_date else None

        # Genres
        genres = data.get("genres", [])
        genre_str = ", ".join(g["name"] for g in genres)

        # Runtime
        runtime_min = data.get("runtime") or (
            data.get("episode_run_time", [None])[0] if data.get("episode_run_time") else None
        )
        runtime = f"{runtime_min} min" if runtime_min else None

        # Credits
        credits = data.get("credits", {})
        cast_list = credits.get("cast", [])
        crew_list = credits.get("crew", [])

        directors = [c["name"] for c in crew_list if c.get("job") == "Director"]
        writers = [c["name"] for c in crew_list if c.get("department") == "Writing"]
        actors = [c["name"] for c in cast_list[:6]]

        # Ratings
        vote_avg = data.get("vote_average")
        imdb_rating = str(round(vote_avg, 1)) if vote_avg else None

        # Languages / countries
        spoken = data.get("spoken_languages", [])
        language = ", ".join(l.get("english_name") or l.get("name", "") for l in spoken) or None
        prod_countries = data.get("production_countries", [])
        country = ", ".join(c.get("name", "") for c in prod_countries) or None

        logger.info(f"TMDB returned: {title} ({year})")

        return {
            "imdb_id": imdb_id,
            "tmdb_id": tmdb_id,
            "title": title,
            "year": year,
            "rated": None,
            "released": release_date,
            "runtime": runtime,
            "genre": genre_str,
            "director": ", ".join(directors) if directors else None,
            "writer": ", ".join(writers[:3]) if writers else None,
            "actors": ", ".join(actors) if actors else None,
            "plot": data.get("overview"),
            "language": language,
            "country": country,
            "awards": None,
            "poster": self._poster_url(data.get("poster_path")),
            "ratings": [],
            "metascore": None,
            "imdb_rating": imdb_rating,
            "imdb_votes": str(data.get("vote_count")) if data.get("vote_count") else None,
            "type": media_type,
            "total_seasons": data.get("number_of_seasons"),
            "box_office": str(data.get("revenue")) if data.get("revenue") else None,
        }
