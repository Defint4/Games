import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.players.schemas import _normalize_pseudo


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class RenameRequest(BaseModel):
    pseudo: str = Field(min_length=2, max_length=20)

    @field_validator("pseudo")
    @classmethod
    def normalize_pseudo(cls, value: str) -> str:
        return _normalize_pseudo(value)


class SuspendRequest(BaseModel):
    suspended: bool


class DeleteRequest(BaseModel):
    # Le pseudo retapé : une suppression ne part pas d'un tap malheureux.
    confirm: str = Field(max_length=20)


class MaintenanceRequest(BaseModel):
    enabled: bool


class SeatOut(BaseModel):
    player_id: uuid.UUID | None
    pseudo: str
    avatar: str
    bot: str | None
    replaced: bool
    connected: bool
    rating: int | None


class RoomOut(BaseModel):
    code: str
    game: str
    status: str
    created_at: datetime
    last_activity: datetime
    turn: int | None
    turn_seconds: int
    options: dict
    chat_count: int
    seats: list[SeatOut]


class ChatOut(BaseModel):
    seat: int
    pseudo: str | None
    text: str


class RoomDetailOut(RoomOut):
    chat: list[ChatOut]


class PlayerCountsOut(BaseModel):
    total: int
    new_day: int
    new_week: int
    active_week: int
    default_pin: int
    locked: int
    suspended: int


class GameTotalsOut(BaseModel):
    players: int
    played: int


class ServerOut(BaseModel):
    version: str | None
    uptime_s: int
    memory_mb: float | None


class OverviewOut(BaseModel):
    players: PlayerCountsOut
    games: dict[str, GameTotalsOut]
    online: int
    watchers: int
    rooms: list[RoomOut]
    maintenance: bool
    server: ServerOut


class PlayerRowOut(BaseModel):
    id: uuid.UUID
    pseudo: str
    avatar: str
    created_at: datetime
    last_seen_at: datetime | None
    played: int
    won: int
    default_pin: bool
    locked: bool
    suspended: bool
    online: bool

    model_config = {"from_attributes": True}


class PlayersOut(BaseModel):
    total: int
    entries: list[PlayerRowOut]


class StatsOut(BaseModel):
    played: int
    won: int
    lost: int
    best_ms: int | None
    rating: int | None


class TableOut(BaseModel):
    code: str
    game: str
    status: str
    connected: bool


class PlayerDetailOut(BaseModel):
    id: uuid.UUID
    pseudo: str
    avatar: str
    created_at: datetime
    last_seen_at: datetime | None
    default_pin: bool
    locked_until: datetime | None
    pin_failures: int
    suspended_at: datetime | None
    admin: bool
    online: bool
    tables: list[TableOut]
    stats: dict[str, StatsOut]


class EventOut(BaseModel):
    id: int
    at: datetime
    action: str
    target: str | None
    detail: dict | None
    ip: str | None

    model_config = {"from_attributes": True}


class EventsOut(BaseModel):
    total: int
    entries: list[EventOut]
