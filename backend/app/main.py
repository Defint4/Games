import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.admin.router import router as admin_router
from app.core.config import settings
from app.core.database import engine
from app.core.rate_limit import limiter
from app.core.version import COMMIT
from app.games.chess.router import router as chess_router
from app.games.solitaire.router import router as solitaire_router
from app.players.router import router as players_router
from app.rooms import lobby
from app.rooms.manager import manager
from app.rooms.router import announce_maintenance
from app.rooms.router import router as rooms_router

if len(settings.jwt_secret) < 32:
    raise RuntimeError(
        "JWT_SECRET is missing or too weak: set at least 32 random characters in .env "
        '(python -c "import secrets; print(secrets.token_urlsafe(48))").'
    )


async def on_rooms_deleted(game: str) -> None:
    await lobby.notify(game)
    # Une partie abandonnée qui retenait la maintenance vient peut-être de disparaître.
    await announce_maintenance()


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(manager.cleanup_loop(on_delete=on_rooms_deleted))
    yield
    cleanup_task.cancel()
    await engine.dispose()


app = FastAPI(title="Games API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    # Même forme que les autres erreurs ({"detail": ...}) : le client affiche le message
    # au lieu de son « réponse inattendue ».
    return JSONResponse(
        {"detail": "Trop de tentatives : réessaie dans quelques minutes."}, status_code=429
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players_router)
app.include_router(rooms_router)
app.include_router(solitaire_router)
app.include_router(chess_router)
app.include_router(admin_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status")
async def status(response: Response) -> dict[str, str | None]:
    """L'état de maintenance (off / draining / locked) et le commit en ligne, lus par
    l'app sur toutes ses pages. Jamais en cache : ni navigateur ni Cloudflare ne doivent
    servir un état périmé."""
    response.headers["Cache-Control"] = "no-store"
    return {"maintenance": manager.maintenance_phase(), "version": COMMIT}
