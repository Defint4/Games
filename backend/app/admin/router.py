"""Le panneau d'administration (voir dependencies.py pour les deux verrous).

GET    /api/admin/session                 session admin valide ? (la prolonge de 30 j)
POST   /api/admin/session                 mot de passe → session admin
DELETE /api/admin/session                 referme la session admin de cet appareil
GET    /api/admin/overview                chiffres, tables en direct, serveur
PUT    /api/admin/maintenance             plus de nouvelles tables (ou de nouveau)
GET    /api/admin/rooms/{code}            une table, chat compris
DELETE /api/admin/rooms/{code}            ferme la table pour tout le monde
GET    /api/admin/players                 inscrits : recherche, tri, pages
GET    /api/admin/players/{id}            fiche d'un joueur
POST   /api/admin/players/{id}/reset-pin  code remis à 0000
POST   /api/admin/players/{id}/unlock     fin du blocage après trop d'essais
POST   /api/admin/players/{id}/sign-out   déconnecte tous ses appareils
PUT    /api/admin/players/{id}/suspended  suspend ou réactive
PATCH  /api/admin/players/{id}            renomme
DELETE /api/admin/players/{id}            supprime (pseudo retapé)
GET    /api/admin/events                  journal
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import service
from app.admin.dependencies import (
    clear_admin_cookie,
    client_ip,
    get_admin_player,
    no_store,
    require_admin,
    set_admin_cookie,
)
from app.admin.models import AdminCredential
from app.admin.schemas import (
    DeleteRequest,
    EventsOut,
    LoginRequest,
    MaintenanceRequest,
    OverviewOut,
    PlayerDetailOut,
    PlayersOut,
    RenameRequest,
    RoomDetailOut,
    SuspendRequest,
)
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.players import service as players_service
from app.players.models import Player
from app.rooms.manager import manager
from app.rooms.router import announce_maintenance, set_maintenance

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(no_store)])

WRONG_PASSWORD = "Mot de passe incorrect."
LOCKED = "Trop d'essais : le panneau est bloqué pendant une heure."
NOT_YOURSELF = "Pas sur ton propre compte."
PLAYER_NOT_FOUND = "Joueur introuvable."


# ---------------------------------------------------------------------------
# Session admin
# ---------------------------------------------------------------------------


@router.get("/session", status_code=204)
async def session(
    request: Request,
    response: Response,
    admin: tuple[Player, AdminCredential] = Depends(get_admin_player),
) -> None:
    """Ouverture du panneau : la session glisse, 30 jours à compter d'aujourd'hui."""
    await require_admin(request, admin)
    set_admin_cookie(response, *admin)


@router.post("/session", status_code=204)
@limiter.limit("5/15minutes")
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    admin: tuple[Player, AdminCredential] = Depends(get_admin_player),
    db: AsyncSession = Depends(get_db),
) -> None:
    player, _ = admin
    ip = client_ip(request)
    try:
        cred = await service.check_password(db, player.id, payload.password)
    except service.Locked:
        await service.record(db, "login_locked", ip)
        raise HTTPException(status_code=423, detail=LOCKED) from None
    except service.WrongPassword:
        await service.record(db, "login_failed", ip)
        raise HTTPException(status_code=403, detail=WRONG_PASSWORD) from None
    await service.record(db, "login", ip)
    set_admin_cookie(response, player, cred)


@router.delete("/session", status_code=204)
async def logout(
    request: Request,
    response: Response,
    player: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.record(db, "logout", client_ip(request))
    clear_admin_cookie(response)


# ---------------------------------------------------------------------------
# Vue d'ensemble, maintenance, tables
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=OverviewOut)
async def overview(_: Player = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.overview(db)


@router.put("/maintenance", status_code=204)
async def maintenance(
    request: Request,
    payload: MaintenanceRequest,
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    if manager.maintenance == payload.enabled:
        return
    # La vérification de l'admin a ouvert une transaction : on la clôt avant la bascule,
    # qui peut prendre du temps (tables une à une) au-delà du délai d'une transaction
    # inactive (idle_in_transaction_session_timeout).
    await db.commit()
    await set_maintenance(payload.enabled)
    action = "maintenance_on" if payload.enabled else "maintenance_off"
    await service.record(db, action, client_ip(request))


def _room(code: str):
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Partie introuvable.")
    return room


@router.get("/rooms/{code}", response_model=RoomDetailOut)
async def room(code: str, _: Player = Depends(require_admin)) -> dict:
    return service.room_detail(_room(code))


@router.delete("/rooms/{code}", status_code=204)
async def close_room(
    request: Request,
    code: str,
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    found = _room(code)
    players = [seat.pseudo for seat in found.seats if seat.bot is None]
    await service.close_room(found)
    # C'était peut-être la dernière partie qui retenait la fermeture.
    await announce_maintenance()
    await service.record(
        db,
        "close_room",
        client_ip(request),
        target=code,
        detail={"game": found.game, "status": found.status.value, "players": players},
    )


# ---------------------------------------------------------------------------
# Joueurs
# ---------------------------------------------------------------------------


@router.get("/players", response_model=PlayersOut)
async def players(
    q: str | None = Query(None, max_length=20),
    sort: str = Query("recent", pattern="^(recent|seen|played|name)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total, rows = await service.list_players(db, (q or "").strip() or None, sort, offset, limit)
    return {"total": total, "entries": rows}


async def _target(db: AsyncSession, player_id: uuid.UUID) -> Player:
    player = await players_service.get_player(db, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail=PLAYER_NOT_FOUND)
    return player


def _not_me(target: Player, admin: Player) -> None:
    """Réinitialiser, déconnecter, suspendre ou supprimer son propre compte fermerait le
    panneau (ou pire) : ça se fait depuis son profil, pas d'ici."""
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail=NOT_YOURSELF)


@router.get("/players/{player_id}", response_model=PlayerDetailOut)
async def player(
    player_id: uuid.UUID,
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.player_detail(db, await _target(db, player_id))


@router.post("/players/{player_id}/reset-pin", response_model=PlayerDetailOut)
@limiter.limit("30/minute")
async def reset_pin(
    request: Request,
    player_id: uuid.UUID,
    admin: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _target(db, player_id)
    _not_me(target, admin)
    await service.reset_pin(db, target)
    await service.record(db, "reset_pin", client_ip(request), target=target.pseudo)
    return await service.player_detail(db, target)


@router.post("/players/{player_id}/unlock", response_model=PlayerDetailOut)
@limiter.limit("30/minute")
async def unlock(
    request: Request,
    player_id: uuid.UUID,
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _target(db, player_id)
    await service.unlock(db, target)
    await service.record(db, "unlock", client_ip(request), target=target.pseudo)
    return await service.player_detail(db, target)


@router.post("/players/{player_id}/sign-out", response_model=PlayerDetailOut)
@limiter.limit("30/minute")
async def sign_out(
    request: Request,
    player_id: uuid.UUID,
    admin: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _target(db, player_id)
    _not_me(target, admin)
    await service.sign_out(db, target)
    await service.record(db, "sign_out", client_ip(request), target=target.pseudo)
    return await service.player_detail(db, target)


@router.put("/players/{player_id}/suspended", response_model=PlayerDetailOut)
@limiter.limit("30/minute")
async def suspend(
    request: Request,
    player_id: uuid.UUID,
    payload: SuspendRequest,
    admin: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _target(db, player_id)
    _not_me(target, admin)
    await service.set_suspended(db, target, payload.suspended)
    action = "suspend" if payload.suspended else "unsuspend"
    await service.record(db, action, client_ip(request), target=target.pseudo)
    return await service.player_detail(db, target)


@router.patch("/players/{player_id}", response_model=PlayerDetailOut)
@limiter.limit("30/minute")
async def rename(
    request: Request,
    player_id: uuid.UUID,
    payload: RenameRequest,
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await _target(db, player_id)
    before = target.pseudo
    try:
        await service.rename(db, target, payload.pseudo)
    except players_service.PseudoTaken:
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris.") from None
    await service.record(
        db, "rename", client_ip(request), target=before, detail={"pseudo": target.pseudo}
    )
    return await service.player_detail(db, target)


@router.delete("/players/{player_id}", status_code=204)
@limiter.limit("30/minute")
async def delete(
    request: Request,
    player_id: uuid.UUID,
    payload: DeleteRequest,
    admin: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    target = await _target(db, player_id)
    _not_me(target, admin)
    if payload.confirm.strip().lower() != target.pseudo_key:
        raise HTTPException(status_code=422, detail="Le pseudo retapé ne correspond pas.")
    pseudo = target.pseudo
    played = sum(s.played for s in target.stats)
    await service.delete(db, target)
    await service.record(db, "delete", client_ip(request), target=pseudo, detail={"played": played})


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------


@router.get("/events", response_model=EventsOut)
async def events(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _: Player = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total, rows = await service.events(db, offset, limit)
    return {"total": total, "entries": rows}
