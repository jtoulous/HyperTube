from fastapi import APIRouter, Query, HTTPException
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from app.services.jackett_service import JackettService
from app.services.omdb_service import OmdbService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])

jackett = JackettService()
omdb = OmdbService()

# Popular query terms used when no genre is selected — cycles through pages
_POPULAR_QUERIES = [
    "2024", "2023", "2022", "movie", "film", "cinema",
    "action", "thriller", "drama", "comedy", "adventure",
    "horror", "animation", "documentary", "sci-fi",
]


@router.get("")
async def search_torrents(
    query: str = Query(..., min_length=1),
    categories: str = Query(""),
):
    results = await jackett.search(query, categories)
    return {"results": results, "count": len(results)}


@router.get("/browse")
async def browse_media(
    genre:   str = Query("",        description="Genre filter e.g. Action"),
    period:  str = Query("all",     description="day | week | month | all"),
    sort_by: str = Query("seeders", description="seeders | rating | year | name"),
    page:    int = Query(1, ge=1),
    limit:   int = Query(20, ge=1, le=50),
):
    """
    Browse popular movies. Queries Jackett (cat 2000), optionally enriches with
    OMDB (poster/rating/year), then filters/sorts/paginates.
    """
    # ── 1. Gather raw Jackett results ──────────────────────────────────────
    search_term = genre if genre else _POPULAR_QUERIES[(page - 1) % len(_POPULAR_QUERIES)]
    raw = await jackett.search(query=search_term, categories="2000")

    # When no genre is specified also pull a second query to get more variety
    if not genre and len(raw) < 40:
        term2 = _POPULAR_QUERIES[page % len(_POPULAR_QUERIES)]
        raw2 = await jackett.search(query=term2, categories="2000")
        raw = raw + raw2

    # ── 2. Period filter ───────────────────────────────────────────────────
    if period != "all":
        raw = _filter_by_period(raw, period)

    # ── 3. Deduplicate by imdbid ───────────────────────────────────────────
    deduped = _deduplicate(raw)

    # ── 4. OMDB enrichment — only items with an imdbid, cap at 40 ─────────
    to_enrich = [r for r in deduped if r.get("imdbid")][:40]
    enriched_map = await _enrich_map(to_enrich)

    # Merge enrichment back into full list
    merged = []
    seen_titles: set[str] = set()
    for r in deduped:
        imdbid = r.get("imdbid")
        if imdbid and imdbid in enriched_map:
            r = {**r, **enriched_map[imdbid]}
        title_key = (r.get("title") or "").lower().strip()
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        merged.append(r)

    # ── 5. Genre post-filter (when using OMDB genre tags) ─────────────────
    if genre:
        with_tag   = [r for r in merged if _matches_genre(r, genre)]
        without_tag = [r for r in merged if not _matches_genre(r, genre)]
        merged = with_tag + without_tag  # keep non-matched at the end

    # ── 6. Sort ────────────────────────────────────────────────────────────
    merged = _sort_results(merged, sort_by)

    # ── 7. Paginate ────────────────────────────────────────────────────────
    total = len(merged)
    start = (page - 1) * limit
    page_results = merged[start:start + limit]

    return {
        "results": page_results,
        "total": total,
        "page": page,
        "has_more": start + limit < total,
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _filter_by_period(results: list, period: str) -> list:
    deltas = {"day": timedelta(days=1), "week": timedelta(weeks=1), "month": timedelta(days=30)}
    if period not in deltas:
        return results
    cutoff = datetime.now(timezone.utc) - deltas[period]
    out = []
    for r in results:
        pub = r.get("pub_date")
        if not pub:
            continue
        dt = _parse_date(pub)
        if dt and dt >= cutoff:
            out.append(r)
    return out


def _parse_date(date_str: str):
    """Try multiple date formats used by Jackett indexers."""
    if not date_str:
        return None
    # Try email.utils (RFC 2822: "Mon, 13 Nov 2023 12:00:00 +0000")
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    # Try ISO 8601
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(date_str[:19], fmt)
            return dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None


def _deduplicate(results: list) -> list:
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


async def _enrich_map(results: list) -> dict:
    """
    Fetch OMDB data in parallel with a small semaphore (3) and short timeout (8s).
    Returns a dict of imdbid → enrichment fields.
    """
    semaphore = asyncio.Semaphore(3)
    out: dict[str, dict] = {}

    async def fetch_one(r: dict):
        imdbid = r.get("imdbid")
        if not imdbid:
            return
        async with semaphore:
            try:
                details = await asyncio.wait_for(omdb.get_by_imdb(imdbid), timeout=8.0)
            except asyncio.TimeoutError:
                logger.warning(f"OMDB timeout for {imdbid}")
                return
            except Exception as e:
                logger.warning(f"OMDB error for {imdbid}: {e}")
                return
        if not details:
            return
        genre_str = details.get("genre") or ""
        out[imdbid] = {
            "title":       details.get("title"),
            "year":        details.get("year"),
            "poster":      details.get("poster"),
            "imdb_rating": details.get("imdb_rating"),
            "plot":        details.get("plot"),
            "runtime":     details.get("runtime"),
            "genre_tags":  [g.strip() for g in genre_str.split(",") if g.strip()],
        }

    await asyncio.gather(*[fetch_one(r) for r in results], return_exceptions=True)
    return out


def _matches_genre(result: dict, genre: str) -> bool:
    tags = result.get("genre_tags", [])
    return any(genre.lower() in t.lower() for t in tags)


def _sort_results(results: list, sort_by: str) -> list:
    if sort_by == "seeders":
        return sorted(results, key=lambda r: r.get("seeders", 0), reverse=True)
    if sort_by == "rating":
        def _r(r):
            try: return float(r.get("imdb_rating") or 0)
            except: return 0.0
        return sorted(results, key=_r, reverse=True)
    if sort_by == "year":
        def _y(r):
            try: return int(str(r.get("year") or "0")[:4])
            except: return 0
        return sorted(results, key=_y, reverse=True)
    if sort_by == "name":
        return sorted(results, key=lambda r: (r.get("title") or "").lower())
    return results


# ─── Media details ─────────────────────────────────────────────────────────────

@router.get("/media/{imdb_id}")
async def get_media_details(imdb_id: str):
    imdb_id = imdb_id.strip()
    if not imdb_id.startswith("tt"):
        imdb_id = "tt" + imdb_id
    details = await omdb.get_by_imdb(imdb_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"No details found for {imdb_id}")
    return details
