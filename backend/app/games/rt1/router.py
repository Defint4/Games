"""RT1 : la progression du pilote et les classements par circuit.

GET  /api/rt1/me                          argent, niveau, missions, records et places
POST /api/rt1/finish                      une course finie → gains, record, missions
GET  /api/rt1/leaderboard/{circuit}       meilleur temps de chacun sur un circuit
GET  /api/rt1/ghost/{circuit}/{pseudo}    le fantôme d'un pilote, pour le défier
POST /api/rt1/garage/buy                  acheter un véhicule (il devient celui qui roule)
POST /api/rt1/garage/select               choisir le véhicule qui roule
POST /api/rt1/workshop/upgrade            passer une pièce au niveau suivant
POST /api/rt1/workshop/tune               régler un réglage fin (pièce au niveau 5)
POST /api/rt1/workshop/livery             enregistrer la livrée d'un véhicule
"""

import base64
import binascii
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.games.rt1 import rules, service
from app.players.dependencies import get_current_player
from app.players.models import Player

router = APIRouter(prefix="/api/rt1", tags=["rt1"])

UNKNOWN_CIRCUIT = "Circuit inconnu."
NO_GHOST = "Pas de fantôme pour ce temps."
BAD_GHOST = "Fantôme illisible."
BAD_PLACE = "Place impossible."
UNKNOWN_VEHICLE = "Véhicule inconnu."
NOT_OWNED = "Ce véhicule n'est pas au garage."
UNKNOWN_PART = "Pièce inconnue."
UNKNOWN_TUNE = "Réglage inconnu."

# Une course dure de 30 s à 2 min ; au-delà de 10 min, ce n'est plus une course.
MAX_TIME_MS = 600_000
# 20 poses de 8 flottants par seconde pendant 10 min, en base64.
MAX_GHOST_CHARS = 520_000


class RecordOut(BaseModel):
    time_ms: int
    splits: list[int]
    rank: int
    vehicle: str


class MissionOut(BaseModel):
    id: str
    reward: int
    progress: int
    target: int
    done: bool


class StateOut(BaseModel):
    money: int
    xp: int
    level: int
    # Expérience du niveau en cours et du suivant : la jauge du profil.
    level_xp: int
    next_level_xp: int
    finishes: int
    records: dict[str, RecordOut]
    missions: list[MissionOut]
    vehicles: list[str]
    vehicle: str
    # {véhicule: {"levels": {pièce: niveau}, "tune": {réglage: valeur}, "livery": {…}}}
    workshop: dict[str, dict[str, Any]]


def _state_out(s: service.State) -> StateOut:
    level = rules.level_for(s.xp)
    bests = {c: r.time_ms for c, r in s.records.items()}
    return StateOut(
        money=s.money,
        xp=s.xp,
        level=level,
        level_xp=rules.level_floor(level),
        next_level_xp=rules.level_floor(level + 1),
        finishes=s.finishes,
        records={
            c: RecordOut(time_ms=r.time_ms, splits=r.splits, rank=r.rank, vehicle=r.vehicle)
            for c, r in s.records.items()
        },
        missions=[
            MissionOut(
                id=m.id,
                reward=m.reward,
                progress=m.progress(bests, s.finishes, s.workshop),
                target=m.count,
                done=m.id in s.missions,
            )
            for m in rules.MISSIONS
        ],
        vehicles=s.vehicles,
        vehicle=s.vehicle,
        workshop=s.workshop,
    )


def _check_circuit(circuit: str) -> None:
    if circuit not in rules.CIRCUITS:
        raise HTTPException(status_code=404, detail=UNKNOWN_CIRCUIT)


def _check_vehicle(vehicle: str) -> None:
    if vehicle not in rules.VEHICLES:
        raise HTTPException(status_code=404, detail=UNKNOWN_VEHICLE)


@router.get("/me", response_model=StateOut)
async def me(
    player: Player = Depends(get_current_player), db: AsyncSession = Depends(get_db)
) -> StateOut:
    return _state_out(await service.state(db, player.id))


class BotsRequest(BaseModel):
    level: str = Field(pattern="^(easy|normal|hard|expert)$")
    count: int = Field(ge=1, le=rules.MAX_BOTS)
    place: int = Field(ge=1, le=rules.MAX_BOTS + 1)


class FinishRequest(BaseModel):
    circuit: str = Field(max_length=40)
    time_ms: int = Field(gt=0, le=MAX_TIME_MS)
    splits: list[int] = Field(max_length=64)
    # Envoyé seulement quand l'appareil pense tenir un record.
    ghost: str | None = Field(default=None, max_length=MAX_GHOST_CHARS)
    # Course contre les bots : leur niveau, leur nombre, la place obtenue.
    bots: BotsRequest | None = None
    vehicle: str = Field(default=rules.STARTER, max_length=20)
    # Indice de performance du véhicule tel qu'il a roulé (atelier compris).
    pi: int | None = Field(default=None, ge=0, le=5000)


class GainOut(BaseModel):
    kind: str
    money: int
    id: str | None


class FinishOut(BaseModel):
    record: bool
    best_ms: int
    gains: list[GainOut]
    level_before: int
    state: StateOut


@router.post("/finish", response_model=FinishOut)
@limiter.limit("60/minute")
async def finish(
    request: Request,
    payload: FinishRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> FinishOut:
    _check_circuit(payload.circuit)
    _check_vehicle(payload.vehicle)
    ghost = None
    if payload.ghost is not None:
        try:
            ghost = base64.b64decode(payload.ghost, validate=True)
        except binascii.Error:
            raise HTTPException(status_code=422, detail=BAD_GHOST) from None
    bots = payload.bots
    if bots is not None and bots.place > bots.count + 1:
        raise HTTPException(status_code=422, detail=BAD_PLACE)
    try:
        arrival = await service.finish(
            db,
            player.id,
            payload.circuit,
            payload.time_ms,
            payload.splits,
            ghost,
            None if bots is None else service.BotsResult(bots.level, bots.count, bots.place),
            payload.vehicle,
            payload.pi,
        )
    except service.NotOwned:
        raise HTTPException(status_code=422, detail=NOT_OWNED) from None
    return FinishOut(
        record=arrival.record,
        best_ms=arrival.best_ms,
        gains=[GainOut(kind=g.kind, money=g.money, id=g.id) for g in arrival.gains],
        level_before=arrival.level_before,
        state=_state_out(arrival.state),
    )


class EntryOut(BaseModel):
    rank: int
    pseudo: str
    avatar: str
    time_ms: int
    has_ghost: bool
    vehicle: str


class BoardOut(BaseModel):
    total: int
    entries: list[EntryOut]
    me: EntryOut | None


@router.get("/leaderboard/{circuit}", response_model=BoardOut)
@limiter.limit("60/minute")
async def leaderboard(
    request: Request,
    circuit: str,
    limit: int = Query(50, ge=1, le=100),
    me: str | None = Query(None, max_length=20),
    db: AsyncSession = Depends(get_db),
) -> BoardOut:
    _check_circuit(circuit)
    board = await service.leaderboard(db, circuit, limit, me)
    return BoardOut.model_validate(board, from_attributes=True)


class GhostOut(BaseModel):
    pseudo: str
    time_ms: int
    splits: list[int]
    ghost: str
    vehicle: str


@router.get("/ghost/{circuit}/{pseudo}", response_model=GhostOut)
@limiter.limit("60/minute")
async def ghost(
    request: Request, circuit: str, pseudo: str, db: AsyncSession = Depends(get_db)
) -> GhostOut:
    _check_circuit(circuit)
    found = await service.ghost(db, circuit, pseudo)
    if found is None or found[0].ghost is None:
        raise HTTPException(status_code=404, detail=NO_GHOST)
    rec, name = found
    return GhostOut(
        pseudo=name,
        time_ms=rec.time_ms,
        splits=rec.splits,
        ghost=base64.b64encode(rec.ghost).decode(),
        vehicle=rec.vehicle,
    )


class VehicleRequest(BaseModel):
    vehicle: str = Field(max_length=20)


@router.post("/garage/buy", response_model=StateOut)
@limiter.limit("30/minute")
async def buy(
    request: Request,
    payload: VehicleRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> StateOut:
    _check_vehicle(payload.vehicle)
    try:
        return _state_out(await service.buy(db, player.id, payload.vehicle))
    except service.GarageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


class UpgradeRequest(BaseModel):
    vehicle: str = Field(max_length=20)
    part: str = Field(max_length=20)


@router.post("/workshop/upgrade", response_model=StateOut)
@limiter.limit("60/minute")
async def upgrade(
    request: Request,
    payload: UpgradeRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> StateOut:
    _check_vehicle(payload.vehicle)
    if payload.part not in rules.PARTS:
        raise HTTPException(status_code=404, detail=UNKNOWN_PART)
    try:
        return _state_out(await service.upgrade(db, player.id, payload.vehicle, payload.part))
    except service.NotOwned:
        raise HTTPException(status_code=409, detail=NOT_OWNED) from None
    except service.GarageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


class TuneRequest(BaseModel):
    vehicle: str = Field(max_length=20)
    key: str = Field(max_length=20)
    value: float = Field(ge=-1, le=1)


@router.post("/workshop/tune", response_model=StateOut)
@limiter.limit("120/minute")
async def tune(
    request: Request,
    payload: TuneRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> StateOut:
    _check_vehicle(payload.vehicle)
    if payload.key not in rules.TUNES:
        raise HTTPException(status_code=404, detail=UNKNOWN_TUNE)
    try:
        return _state_out(
            await service.tune(db, player.id, payload.vehicle, payload.key, payload.value)
        )
    except service.NotOwned:
        raise HTTPException(status_code=409, detail=NOT_OWNED) from None
    except service.GarageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


HEX = r"^#[0-9A-Fa-f]{6}$"


class Layer(BaseModel):
    """Un calque du logo : forme, motif (identifiants côté client) ou texte, dans un carré
    de -1 à 1."""

    kind: Literal["shape", "motif", "text"]
    name: str = Field(min_length=1, max_length=14)
    color: str = Field(pattern=HEX)
    x: float = Field(ge=-1, le=1)
    y: float = Field(ge=-1, le=1)
    size: float = Field(ge=0.05, le=2)
    rot: float = Field(ge=-180, le=180)


class Livery(BaseModel):
    color: str = Field(pattern=HEX)
    color2: str = Field(pattern=HEX)
    tone: Literal["none", "lower", "stripes", "front", "split"]
    finish: Literal["matte", "gloss", "metal", "pearl", "chrome"]
    rims: str = Field(pattern=HEX)
    tint: float = Field(ge=0, le=1)
    number: int | None = Field(default=None, ge=0, le=99)
    layers: list[Layer] = Field(max_length=8)
    zones: list[Literal["hood", "roof", "doors", "rear"]] = Field(max_length=4)


class LiveryRequest(BaseModel):
    vehicle: str = Field(max_length=20)
    livery: Livery


@router.post("/workshop/livery", response_model=StateOut)
@limiter.limit("60/minute")
async def livery(
    request: Request,
    payload: LiveryRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> StateOut:
    _check_vehicle(payload.vehicle)
    try:
        return _state_out(
            await service.paint(db, player.id, payload.vehicle, payload.livery.model_dump())
        )
    except service.NotOwned:
        raise HTTPException(status_code=409, detail=NOT_OWNED) from None


@router.post("/garage/select", response_model=StateOut)
@limiter.limit("60/minute")
async def select(
    request: Request,
    payload: VehicleRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> StateOut:
    _check_vehicle(payload.vehicle)
    try:
        return _state_out(await service.select_vehicle(db, player.id, payload.vehicle))
    except service.NotOwned:
        raise HTTPException(status_code=409, detail=NOT_OWNED) from None
