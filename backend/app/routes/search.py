from fastapi import APIRouter, Query, HTTPException
import logging
from app.services.jackett_service import JackettService
from app.services.omdb_service import OmdbService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])

jackett = JackettService()
omdb = OmdbService()


@router.get("")
async def search_torrents(
    query: str = Query(..., min_length=1, description="Search query"),
    categories: str = Query("", description="Comma-separated Torznab category IDs (e.g. 2000 for movies, 5000 for TV)"),
):
    """
    Search all Jackett indexers for torrents matching the query.
    Returns a list of results sorted by seeders.
    """
    results = await jackett.search(query, categories)
    return {"results": results, "count": len(results)}


def _normalize_imdb_id(imdb_id: str) -> str:
    """Ensure imdb_id has the 'tt' prefix."""
    imdb_id = imdb_id.strip()
    if not imdb_id.startswith("tt"):
        imdb_id = "tt" + imdb_id
    return imdb_id


@router.get("/media/{imdb_id}")
async def get_media_details(imdb_id: str):
    """
    Get full movie/series details from OMDB using an IMDb ID.
    """
    imdb_id = _normalize_imdb_id(imdb_id)
    logger.info(f"Fetching OMDB details for {imdb_id}")

    details = await omdb.get_by_imdb(imdb_id)
    if not details:
        logger.warning(f"No OMDB details returned for {imdb_id}")
        raise HTTPException(status_code=404, detail=f"No details found for {imdb_id}")

    return details
