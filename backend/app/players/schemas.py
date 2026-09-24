import re
import uuid

from pydantic import BaseModel, Field, field_validator

from app.players.models import Player

PSEUDO_PATTERN = r"^[A-Za-z0-9À-ÖØ-öø-ÿ_\- ]{2,20}$"
AVATAR_PATTERN = r"^[a-z0-9\-]{1,40}$"
PIN_PATTERN = r"^[0-9]{4}$"


def _normalize_pseudo(value: str) -> str:
    value = " ".join(value.split())  # espaces superflus
    if not re.fullmatch(PSEUDO_PATTERN, value):
        raise ValueError("Pseudo invalide : lettres, chiffres, espaces, - et _ uniquement.")
    return value


class EnterRequest(BaseModel):
    """Connexion (pseudo existant) ou création (pseudo libre, avatar alors obligatoire)."""

    pseudo: str = Field(min_length=2, max_length=20)
    pin: str = Field(pattern=PIN_PATTERN)
    avatar: str | None = Field(default=None, pattern=AVATAR_PATTERN)

    @field_validator("pseudo")
    @classmethod
    def normalize_pseudo(cls, value: str) -> str:
        return _normalize_pseudo(value)


class UpdateMeRequest(BaseModel):
    """Modification du profil connecté : pseudo et/ou avatar, les stats suivent."""

    pseudo: str | None = Field(default=None, min_length=2, max_length=20)
    avatar: str | None = Field(default=None, pattern=AVATAR_PATTERN)

    @field_validator("pseudo")
    @classmethod
    def normalize_pseudo(cls, value: str | None) -> str | None:
        return None if value is None else _normalize_pseudo(value)


class ChangePinRequest(BaseModel):
    current_pin: str = Field(pattern=PIN_PATTERN)
    new_pin: str = Field(pattern=PIN_PATTERN)


class GameStatsOut(BaseModel):
    played: int
    won: int
    lost: int
    best_ms: int | None = None

    model_config = {"from_attributes": True}


class PlayerOut(BaseModel):
    id: uuid.UUID
    pseudo: str
    avatar: str
    # Par jeu (clé = slug) ; un jeu jamais joué n'apparaît pas.
    stats: dict[str, GameStatsOut]

    @classmethod
    def from_player(cls, player: Player) -> "PlayerOut":
        return cls(
            id=player.id,
            pseudo=player.pseudo,
            avatar=player.avatar,
            stats={s.game: GameStatsOut.model_validate(s) for s in player.stats},
        )


class MeOut(PlayerOut):
    """Le profil vu par son propriétaire. `default_pin` ne sort jamais dans le profil
    public : ce serait désigner les comptes qu'on ouvre avec 0000."""

    default_pin: bool

    @classmethod
    def from_player(cls, player: Player) -> "MeOut":
        return cls(
            **PlayerOut.from_player(player).model_dump(),
            default_pin=player.pin_hash is None,
        )


class EnterResponse(BaseModel):
    player: MeOut
    token: str


class LeaderboardEntryOut(BaseModel):
    rank: int
    id: uuid.UUID
    pseudo: str
    avatar: str
    played: int
    won: int
    lost: int
    best_ms: int | None = None

    model_config = {"from_attributes": True}


class LeaderboardOut(BaseModel):
    total: int
    entries: list[LeaderboardEntryOut]
    me: LeaderboardEntryOut | None

    model_config = {"from_attributes": True}
