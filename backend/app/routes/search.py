from fastapi import APIRouter, Query, HTTPException
import logging
from datetime import datetime, timedelta, timezone
from app.services.jackett_service import JackettService
from app.services.tmdb_service import TmdbService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])

jackett = JackettService()
tmdb = TmdbService()

# TMDB genre ID mapping
_TMDB_GENRE_IDS: dict[str, int] = {
    "action":      28,
    "comedy":      35,
    "drama":       18,
    "horror":      27,
    "thriller":    53,
    "sci-fi":      878,
    "animation":   16,
    "romance":     10749,
    "crime":       80,
    "adventure":   12,
    "documentary": 99,
    "family":      10751,
}

# Map frontend sort keys → TMDB sort_by values
_TMDB_SORT_MAP: dict[str, str] = {
    "seeders": "popularity.desc",
    "rating":  "vote_average.desc",
    "year":    "primary_release_date.desc",
    "name":    "title.asc",
}


#  Jackett raw torrent search

_ADULT_TITLE_WORDS = {"xxx", "porn", "hentai"}

def _is_adult_content(result: dict) -> bool:
    """Return True if the torrent appears to be adult / XXX content."""
    # 1. Torznab category IDs 6000-6999 = "XXX"
    for cid in result.get("category_ids", []):
        try:
            if 6000 <= int(cid) < 7000:
                return True
        except (ValueError, TypeError):
            pass
    # 2. Category text
    cat = (result.get("category") or "").lower()
    if any(k in cat for k in ("xxx", "adult", "porn")):
        return True
    # 3. Title keywords
    title = _re.sub(r"[^a-z0-9\s]", " ", (result.get("title") or "").lower())
    if _ADULT_TITLE_WORDS & set(title.split()):
        return True
    return False


@router.get("")
async def search_torrents(
    query: str = Query(..., min_length=1),
    categories: str = Query(""),
    tmdb_id: int = Query(0, description="Optional TMDB ID to prioritize matching torrents"),
):
    """Search Jackett for torrents matching the given title."""
    results = await jackett.search(query, categories)

    # Filter out adult / XXX content
    results = [r for r in results if not _is_adult_content(r)]

    deduped = _deduplicate_for_search(results)

    # If a tmdb_id was provided, resolve it to an IMDb ID and sort by relevance
    if tmdb_id:
        target_imdbid = await _resolve_imdbid(tmdb_id)
        deduped = _sort_by_relevance(deduped, query, target_imdbid)

    return {"results": deduped, "count": len(deduped)}


#  TMDB title search (returns thumbnail-ready cards)

@router.get("/tmdb")
async def search_tmdb(
    query: str = Query(..., min_length=1),
    page:  int = Query(1, ge=1),
):
    """Search TMDB by title. Returns movie/TV cards with poster + metadata."""
    results = await tmdb.search_by_title(query, page)
    return {"results": results, "page": page, "has_more": len(results) >= 20}


#  Browse via TMDB Discover

@router.get("/browse")
async def browse_media(
    genre:   str = Query("",        description="Genre filter e.g. Action"),
    period:  str = Query("all",     description="day | week | month | all"),
    sort_by: str = Query("seeders", description="seeders | rating | year | name"),
    page:    int = Query(1, ge=1),
):
    """
    Browse popular movies via TMDB Discover.
    Every result has a poster — no blank thumbnails.
    """
    genre_id  = _TMDB_GENRE_IDS.get(genre.lower()) if genre else None
    tmdb_sort = _TMDB_SORT_MAP.get(sort_by, "popularity.desc")

    # Period → TMDB release date filter
    date_gte: str | None = None
    date_lte: str | None = None
    if period != "all":
        deltas = {"day": timedelta(days=1), "week": timedelta(weeks=1), "month": timedelta(days=30)}
        delta = deltas.get(period)
        if delta:
            now = datetime.now(timezone.utc)
            date_gte = (now - delta).strftime("%Y-%m-%d")
            date_lte = now.strftime("%Y-%m-%d")

    results = await tmdb.discover(
        genre_id=genre_id,
        sort_by=tmdb_sort,
        page=page,
        date_gte=date_gte,
        date_lte=date_lte,
    )

    return {
        "results":  results,
        "page":     page,
        "has_more": len(results) >= 18,   # TMDB returns up to 20/page; allow more pages
    }



#  Helpers

async def _resolve_imdbid(tmdb_id: int) -> str | None:
    """Resolve a TMDB movie ID to an IMDb ID via /movie/{id}/external_ids."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await tmdb._get(client, f"https://api.themoviedb.org/3/movie/{tmdb_id}/external_ids")
            data = resp.json()
            imdb_id = data.get("imdb_id")
            if imdb_id:
                return imdb_id
            # Try TV show
            resp = await tmdb._get(client, f"https://api.themoviedb.org/3/tv/{tmdb_id}/external_ids")
            data = resp.json()
            return data.get("imdb_id")
    except Exception as e:
        logger.warning(f"Could not resolve TMDB {tmdb_id} to IMDb: {e}")
        return None


def _deduplicate_for_search(results: list) -> list:
    """Keep the best-seeded torrent per imdbid; preserve non-imdbid entries."""
    best: dict[str, dict] = {}
    no_imdb = []
    for r in results:
        imdbid = r.get("imdbid")
        if imdbid:
            if imdbid not in best or r.get("seeders", 0) > best[imdbid].get("seeders", 0):
                best[imdbid] = r
        else:
            no_imdb.append(r)
    return list(best.values()) + no_imdb


import re as _re

def _normalize_title(t: str) -> str:
    """Lowercase, strip year/quality tags, punctuation → just words."""
    t = t.lower()
    # Remove everything after common quality/codec markers
    t = _re.split(r'\b(1080p|720p|2160p|4k|uhd|bluray|brrip|bdrip|web-?dl|webrip|hdtv|remux|hevc|x264|x265|h\.?264|h\.?265|aac|dts|ac3|multi|repack)\b', t)[0]
    # Remove year in parentheses or standalone 4-digit year
    t = _re.sub(r'[\(\[]?\d{4}[\)\]]?', '', t)
    # Keep only alphanumeric and spaces
    t = _re.sub(r'[^a-z0-9\s]', ' ', t)
    return ' '.join(t.split()).strip()


def _title_match_score(torrent_title: str, search_query: str) -> float:
    """
    Score 0.0-1.0 how well a torrent title matches the expected movie title.
    1.0 = all words of the query appear in the torrent title.
    """
    normalized = _normalize_title(torrent_title)
    query_words = _normalize_title(search_query).split()
    if not query_words:
        return 0.0
    matched = sum(1 for w in query_words if w in normalized)
    return matched / len(query_words)


def _sort_by_relevance(results: list, query: str, target_imdbid: str | None) -> list:
    """
    Sort torrent results by relevance:
    - Priority 1: matching imdbid (if resolved)
    - Priority 2: title contains all query words (score == 1.0)
    - Within each tier: sorted by seeders descending
    - Non-matching results pushed to the end
    """
    def sort_key(r):
        has_imdb_match = 1 if (target_imdbid and r.get("imdbid") == target_imdbid) else 0
        title_score = _title_match_score(r.get("title", ""), query)
        seeders = r.get("seeders", 0)
        # Sort descending: negate so higher = first
        return (-has_imdb_match, -title_score, -seeders)

    return sorted(results, key=sort_key)


#  Media details

@router.get("/media/{imdb_id}")
async def get_media_details(imdb_id: str):
    imdb_id = imdb_id.strip()
    if not imdb_id.startswith("tt"):
        imdb_id = "tt" + imdb_id
    details = await tmdb.get_by_imdb(imdb_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"No details found for {imdb_id}")
    return details
