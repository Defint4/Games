"""Les erreurs survenues dans le navigateur des joueurs, remontées au journal.

POST /api/client-errors   une erreur côté client → une entrée du journal (app.journal)

Sans ça, un écran « Oups », une victoire qui ne part pas ou un WebSocket qui tombe en
boucle restent invisibles du serveur. Le quota par adresse borne le bruit.
"""

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.journal import record

router = APIRouter(prefix="/api/client-errors", tags=["telemetry"])

# Ce que le client a attrapé. render / window / promise : une exception, donc une erreur ;
# le reste (requête échouée, socket coupé, finish du Solitaire) : un avertissement.
ERROR_CONTEXTS = {"render", "window", "promise"}


class ClientErrorIn(BaseModel):
    message: str = Field(max_length=500)
    stack: str | None = Field(default=None, max_length=4000)
    # Chemin de la page, sans chaîne de requête.
    url: str = Field(max_length=300)
    # Où l'erreur a été attrapée : render (écran Oups), window, promise, api, socket, ou
    # un nom donné par le code qui la signale (solitaire-finish…).
    context: str = Field(max_length=60)
    # Déclaratifs, pour retrouver la partie : jamais une preuve d'identité.
    pseudo: str | None = Field(default=None, max_length=20)
    game: str | None = Field(default=None, max_length=20)
    room: str | None = Field(default=None, max_length=8)
    build: str | None = Field(default=None, max_length=40)


@router.post("", status_code=204)
@limiter.limit("10/minute")
async def report(request: Request, payload: ClientErrorIn) -> Response:
    level = "error" if payload.context in ERROR_CONTEXTS else "warning"
    record(
        level,
        f"client_{payload.context}"[:40],
        payload.message,
        game=payload.game,
        pseudo=payload.pseudo,
        room=payload.room,
        detail={"build": payload.build, "stack": payload.stack},
        path=payload.url,
    )
    return Response(status_code=204)
