from fastapi import APIRouter
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.stream import router as stream_router
from app.routes.search import router as search_router
from app.routes.downloads import router as downloads_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(stream_router)
router.include_router(search_router)
router.include_router(downloads_router)
