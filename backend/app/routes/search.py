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


# ─── Jackett raw torrent search ───────────────────────────────────────────────

@router.get("")
async def search_torrents(
    query: str = Query(..., min_length=1),
    categories: str = Query(""),
):
    """Search Jackett for torrents matching the given title."""
    results = await jackett.search(query, categories)
    deduped = _deduplicate_for_search(results)
    return {"results": deduped, "count": len(deduped)}


# ─── TMDB title search (returns thumbnail-ready cards) ───────────────────────

@router.get("/tmdb")
async def search_tmdb(
    query: str = Query(..., min_length=1),
    page:  int = Query(1, ge=1),
):
    """Search TMDB by title. Returns movie/TV cards with poster + metadata."""
    results = await tmdb.search_by_title(query, page)
    return {"results": results, "page": page, "has_more": len(results) >= 20}


# ─── Browse via TMDB Discover ─────────────────────────────────────────────────

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



# ─── Helpers ──────────────────────────────────────────────────────────────────

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


# ─── Media details ─────────────────────────────────────────────────────────────

@router.get("/media/{imdb_id}")
async def get_media_details(imdb_id: str):
    imdb_id = imdb_id.strip()
    if not imdb_id.startswith("tt"):
        imdb_id = "tt" + imdb_id
    details = await tmdb.get_by_imdb(imdb_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"No details found for {imdb_id}")
    return details
