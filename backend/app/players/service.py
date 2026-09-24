import asyncio
import hmac
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_pin, verify_pin
from app.players.models import Player, PlayerGameStats

DEFAULT_PIN = "0000"
PIN_MAX_FAILURES = 5
PIN_LOCK = timedelta(minutes=15)


class PseudoTaken(Exception):
    pass


class WrongPin(Exception):
    pass


class PinLocked(Exception):
    pass


class AvatarRequired(Exception):
    pass


class Suspended(Exception):
    pass


async def _check_pin(db: AsyncSession, player: Player, pin: str) -> None:
    """Vérifie le code du joueur, dont la ligne est verrouillée (FOR UPDATE) par l'appelant :
    les essais sur un même compte passent un par un, le compteur d'échecs ne peut pas être
    contourné en rafale. Après PIN_MAX_FAILURES échecs d'affilée, le compte est bloqué
    PIN_LOCK, quel que soit l'appareil."""
    now = datetime.now(UTC)
    if player.pin_locked_until is not None and player.pin_locked_until > now:
        raise PinLocked
    if player.pin_hash is None:
        ok = hmac.compare_digest(pin, DEFAULT_PIN)
    else:
        # scrypt occupe le processeur ~50 ms : hors de la boucle, les tables continuent de jouer.
        ok = await asyncio.to_thread(verify_pin, pin, player.pin_hash)
    if ok:
        player.pin_failures = 0
        player.pin_locked_until = None
        return
    player.pin_failures += 1
    if player.pin_failures >= PIN_MAX_FAILURES:
        player.pin_failures = 0
        player.pin_locked_until = now + PIN_LOCK
    await db.commit()
    raise WrongPin


async def enter(db: AsyncSession, pseudo: str, pin: str, avatar: str | None) -> Player:
    """Connexion par pseudo (insensible à la casse) + code PIN, ou création du compte si
    le pseudo est libre. Un compte d'avant les codes se déverrouille avec DEFAULT_PIN."""
    key = pseudo.lower()
    player = await db.scalar(select(Player).where(Player.pseudo_key == key).with_for_update())
    if player is None:
        if avatar is None:
            raise AvatarRequired
        pin_hash = await asyncio.to_thread(hash_pin, pin)
        player = Player(pseudo_key=key, pseudo=pseudo, avatar=avatar, pin_hash=pin_hash)
        db.add(player)
    else:
        await _check_pin(db, player, pin)
        # Après le code : la suspension ne se révèle qu'à qui connaît le code.
        if player.suspended_at is not None:
            raise Suspended
    player.last_seen_at = datetime.now(UTC)
    try:
        await db.commit()
    except IntegrityError:
        # Le même pseudo créé au même instant sur un autre appareil.
        await db.rollback()
        raise PseudoTaken from None
    await db.refresh(player)
    return player


async def change_pin(db: AsyncSession, player: Player, current_pin: str, new_pin: str) -> Player:
    """Nouveau code, après vérification de l'actuel. Les autres appareils sont déconnectés :
    leur jeton porte l'ancienne version."""
    await db.refresh(player, with_for_update=True)
    await _check_pin(db, player, current_pin)
    player.pin_hash = await asyncio.to_thread(hash_pin, new_pin)
    player.token_version += 1
    await db.commit()
    await db.refresh(player)
    return player


async def update_profile(
    db: AsyncSession, player: Player, pseudo: str | None, avatar: str | None
) -> Player:
    """Renomme le joueur et/ou change son avatar. Le pseudo d'un autre joueur est refusé ;
    changer seulement la casse de son propre pseudo est permis."""
    if pseudo is not None:
        key = pseudo.lower()
        if key != player.pseudo_key:
            taken = await db.scalar(select(Player.id).where(Player.pseudo_key == key))
            if taken is not None:
                raise PseudoTaken
            player.pseudo_key = key
        player.pseudo = pseudo
    if avatar is not None:
        player.avatar = avatar
    try:
        await db.commit()
    except IntegrityError:
        # Pris entre la vérification et l'écriture.
        await db.rollback()
        raise PseudoTaken from None
    await db.refresh(player)
    return player


async def touch(db: AsyncSession, player: Player) -> None:
    """Le joueur vient d'ouvrir l'app (renouvellement de session)."""
    player.last_seen_at = datetime.now(UTC)
    await db.commit()


async def get_player(db: AsyncSession, player_id: uuid.UUID) -> Player | None:
    return await db.get(Player, player_id)


async def record_game_results(
    db: AsyncSession,
    game: str,
    player_ids: list[uuid.UUID],
    winner_id: uuid.UUID,
    loser_id: uuid.UUID,
) -> None:
    """Stats de fin de partie sur ce jeu : tous ont joué, un gagnant, un perdant."""
    existing = {
        s.player_id: s
        for s in await db.scalars(
            select(PlayerGameStats).where(
                PlayerGameStats.game == game, PlayerGameStats.player_id.in_(player_ids)
            )
        )
    }
    for player_id in player_ids:
        stats = existing.get(player_id)
        if stats is None:
            # Valeurs explicites : les `default` de colonne ne s'appliquent qu'à l'INSERT.
            stats = PlayerGameStats(player_id=player_id, game=game, played=0, won=0, lost=0)
            db.add(stats)
        stats.played += 1
        if player_id == winner_id:
            stats.won += 1
        if player_id == loser_id:
            stats.lost += 1
    await db.commit()


async def add_solo_result(
    db: AsyncSession, game: str, player_id: uuid.UUID, won: bool, duration_ms: int | None = None
) -> PlayerGameStats:
    """Bilan d'une partie solo : jouée, gagnée ou perdue, meilleur temps si victoire
    chronométrée. Sans commit : l'appelant valide la partie et le bilan ensemble."""
    stats = await db.get(PlayerGameStats, (player_id, game), with_for_update=True)
    if stats is None:
        stats = PlayerGameStats(player_id=player_id, game=game, played=0, won=0, lost=0)
        db.add(stats)
    stats.played += 1
    if won:
        stats.won += 1
        if duration_ms is not None and (stats.best_ms is None or duration_ms < stats.best_ms):
            stats.best_ms = duration_ms
    else:
        stats.lost += 1
    return stats


@dataclass
class LeaderboardEntry:
    rank: int
    id: uuid.UUID
    pseudo: str
    avatar: str
    played: int
    won: int
    lost: int
    best_ms: int | None
    rating: int | None


@dataclass
class LeaderboardPage:
    total: int
    entries: list[LeaderboardEntry]
    # Position du joueur demandé (`me`), None s'il n'est pas classé.
    me: LeaderboardEntry | None


def _ranking(game: str | None, rated: bool):
    """Le classement complet, numéroté : un jeu (slug) ou tous les jeux cumulés.

    Victoires d'abord ; à victoires égales, celui qui a eu besoin de moins de
    parties passe devant ; le pseudo départage le reste pour un ordre stable.
    Jeu classé à l'Elo (`rated`) : la cote d'abord, puis le même ordre.
    """
    totals = (
        select(
            Player.id.label("id"),
            Player.pseudo_key.label("pseudo_key"),
            Player.pseudo.label("pseudo"),
            Player.avatar.label("avatar"),
            func.sum(PlayerGameStats.played).label("played"),
            func.sum(PlayerGameStats.won).label("won"),
            func.sum(PlayerGameStats.lost).label("lost"),
            # Seul le Solitaire en a un : affiché sur son classement, hors du tri.
            func.min(PlayerGameStats.best_ms).label("best_ms"),
            # Seuls les échecs en ont une : n'a de sens que sur le classement du jeu.
            func.max(PlayerGameStats.rating).label("rating"),
        )
        .join(PlayerGameStats, PlayerGameStats.player_id == Player.id)
        .group_by(Player.id)
    )
    if game is not None:
        totals = totals.where(PlayerGameStats.game == game)
    totals = totals.subquery("totals")
    order = (totals.c.won.desc(), totals.c.played.asc(), totals.c.pseudo_key.asc())
    if rated:
        order = (totals.c.rating.desc(), *order)
    rank = func.row_number().over(order_by=order)
    return select(totals, rank.label("rank")).subquery("ranking")


async def leaderboard(
    db: AsyncSession, game: str | None, rated: bool, offset: int, limit: int, me: str | None
) -> LeaderboardPage:
    ranking = _ranking(game, rated)
    total = await db.scalar(select(func.count()).select_from(ranking))
    rows = await db.execute(select(ranking).order_by(ranking.c.rank).offset(offset).limit(limit))
    mine = None
    if me is not None:
        row = (await db.execute(select(ranking).where(ranking.c.pseudo_key == me.lower()))).first()
        if row is not None:
            mine = _entry(row)
    return LeaderboardPage(total=total or 0, entries=[_entry(r) for r in rows], me=mine)


def _entry(row) -> LeaderboardEntry:
    return LeaderboardEntry(
        rank=row.rank,
        id=row.id,
        pseudo=row.pseudo,
        avatar=row.avatar,
        played=row.played,
        won=row.won,
        lost=row.lost,
        best_ms=row.best_ms,
        rating=row.rating,
    )
