import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.games.rt1 import rules
from app.games.rt1.models import Rt1Profile, Rt1Race, Rt1Record
from app.players.models import Player


@dataclass
class Gain:
    # "finish", "medal" (id = la médaille), "mission" (id = la mission), "bots" ou
    # "online" (id = la place)
    kind: str
    money: int
    id: str | None = None


@dataclass
class BotsResult:
    level: str
    count: int
    place: int


@dataclass
class OnlineResult:
    """Course en direct : pilotes au départ et place à l'arrivée."""

    count: int
    place: int


@dataclass
class Standing:
    time_ms: int
    splits: list[int]
    rank: int
    vehicle: str


@dataclass
class State:
    money: int = 0
    xp: int = 0
    finishes: int = 0
    missions: list[str] = field(default_factory=list)
    records: dict[str, Standing] = field(default_factory=dict)
    vehicles: list[str] = field(default_factory=lambda: [rules.STARTER])
    vehicle: str = rules.STARTER
    workshop: dict = field(default_factory=dict)


async def _ranks(db: AsyncSession, player_id: uuid.UUID) -> dict[str, Standing]:
    """Les records du joueur et sa place sur chaque circuit (1 = le plus rapide), départagés
    comme au classement : à temps égal, le premier à l'avoir signé."""
    other = aliased(Rt1Record)
    ahead = (
        select(func.count())
        .where(
            other.circuit == Rt1Record.circuit,
            or_(
                other.time_ms < Rt1Record.time_ms,
                and_(other.time_ms == Rt1Record.time_ms, other.set_at < Rt1Record.set_at),
            ),
        )
        .correlate(Rt1Record)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(
            Rt1Record.circuit, Rt1Record.time_ms, Rt1Record.splits, ahead, Rt1Record.vehicle
        ).where(Rt1Record.player_id == player_id)
    )
    return {c: Standing(time_ms=t, splits=s, rank=n + 1, vehicle=v) for c, t, s, n, v in rows}


async def state(db: AsyncSession, player_id: uuid.UUID) -> State:
    profile = await db.get(Rt1Profile, player_id)
    records = await _ranks(db, player_id)
    if profile is None:
        return State(records=records)
    return State(
        money=profile.money,
        xp=profile.xp,
        finishes=profile.finishes,
        missions=list(profile.missions),
        records=records,
        vehicles=list(profile.vehicles),
        vehicle=profile.vehicle,
        workshop=dict(profile.workshop),
    )


@dataclass
class Arrival:
    record: bool
    best_ms: int
    gains: list[Gain]
    level_before: int
    state: State


# Un ticket de départ non consommé ne vaut que ce temps : au-delà, la course est perdue.
RACE_TTL = timedelta(hours=1)
# Marge entre le temps déclaré et le temps réellement écoulé depuis le ticket (horloges,
# réseau, chargement) : le temps ne peut pas dépasser ce qu'a vu le serveur.
ELAPSED_SLACK = timedelta(seconds=2)


class RaceError(Exception):
    """Ticket inconnu, périmé, déjà consommé, ou arrivée impossible : message au joueur."""


async def start_race(
    db: AsyncSession, player_id: uuid.UUID, circuit: str, vehicle: str, bots: BotsResult | None
) -> Rt1Race:
    """Un ticket de départ, daté par le serveur ; les tickets périmés du joueur sont jetés."""
    profile = await _locked_profile(db, player_id)
    if vehicle not in profile.vehicles:
        raise NotOwned
    await db.execute(
        delete(Rt1Race).where(
            Rt1Race.player_id == player_id,
            Rt1Race.finished_at.is_(None),
            Rt1Race.started_at < datetime.now(UTC) - RACE_TTL,
        )
    )
    race = Rt1Race(
        player_id=player_id,
        circuit=circuit,
        vehicle=vehicle,
        bots_level=None if bots is None else bots.level,
        bots_count=None if bots is None else bots.count,
    )
    db.add(race)
    await db.commit()
    return race


async def finish_race(
    db: AsyncSession,
    player_id: uuid.UUID,
    race_id: uuid.UUID,
    time_ms: int,
    splits: list[int],
    ghost: bytes | None,
    place: int | None,
    pi: int | None,
) -> Arrival:
    """L'arrivée d'une course lancée par `start_race` : le ticket dit le circuit, le
    véhicule et les bots ; le serveur vérifie que le temps tient dans ce qu'il a vu
    s'écouler. Une arrivée renvoyée (réponse perdue) rend le même résultat sans repayer."""
    await _locked_profile(db, player_id)
    race = await db.get(Rt1Race, race_id)
    if race is None or race.player_id != player_id:
        raise RaceError("Course inconnue.")
    now = datetime.now(UTC)
    if race.finished_at is not None:
        if race.result is None or race.result.get("time_ms") != time_ms:
            raise RaceError("Course déjà comptée.")
        r = race.result
        return Arrival(
            record=r["record"],
            best_ms=r["best_ms"],
            gains=[Gain(g["kind"], g["money"], g["id"]) for g in r["gains"]],
            level_before=r["level_before"],
            state=await state(db, player_id),
        )
    if now - race.started_at > RACE_TTL:
        raise RaceError("Course périmée.")
    if not rules.plausible_time(race.circuit, time_ms):
        raise RaceError("Temps impossible.")
    if timedelta(milliseconds=time_ms) > now - race.started_at + ELAPSED_SLACK:
        raise RaceError("Temps impossible.")
    if not rules.plausible_splits(race.circuit, time_ms, splits):
        raise RaceError("Temps de passage impossibles.")
    if ghost is not None and not rules.plausible_ghost(time_ms, ghost):
        raise RaceError("Fantôme illisible.")
    bots = None
    if race.bots_level is not None and race.bots_count is not None:
        if place is None or not 1 <= place <= race.bots_count + 1:
            raise RaceError("Place impossible.")
        bots = BotsResult(race.bots_level, race.bots_count, place)
    arrival = await finish(
        db, player_id, race.circuit, time_ms, splits, ghost, bots, race.vehicle, pi, commit=False
    )
    race.finished_at = now
    race.result = {
        "time_ms": time_ms,
        "record": arrival.record,
        "best_ms": arrival.best_ms,
        "gains": [{"kind": g.kind, "money": g.money, "id": g.id} for g in arrival.gains],
        "level_before": arrival.level_before,
    }
    await db.commit()
    return arrival


async def finish(
    db: AsyncSession,
    player_id: uuid.UUID,
    circuit: str,
    time_ms: int,
    splits: list[int],
    ghost: bytes | None,
    bots: BotsResult | None = None,
    vehicle: str = rules.STARTER,
    pi: int | None = None,
    online: OnlineResult | None = None,
    commit: bool = True,
) -> Arrival:
    """Une course finie : gain de base, place contre les bots ou en ligne, médailles
    nouvelles, record, missions accomplies. En solo, `finish_race` a vérifié le temps
    contre son ticket ; en direct, c'est la table (spec.py) qui l'a mesuré."""
    # Verrou sur le joueur : deux arrivées simultanées ne paient pas deux fois la même
    # médaille ni la même mission.
    profile = await _locked_profile(db, player_id)
    if vehicle not in profile.vehicles:
        raise NotOwned
    level_before = rules.level_for(profile.xp)

    gains = [Gain("finish", rules.FINISH_MONEY)]
    profile.finishes += 1
    profile.money += rules.FINISH_MONEY
    profile.xp += rules.FINISH_XP
    if bots is not None:
        money = rules.bots_money(bots.level, bots.count, bots.place)
        gains.append(Gain("bots", money, str(bots.place)))
        profile.money += money
        profile.xp += money // 10
    if online is not None:
        money = rules.online_money(online.count, online.place)
        gains.append(Gain("online", money, str(online.place)))
        profile.money += money
        profile.xp += money // 10

    rec = await db.get(Rt1Record, (player_id, circuit))
    old = rec.time_ms if rec is not None else None
    is_record = old is None or time_ms < old
    if is_record:
        had = set(rules.medals_for(circuit, old))
        for medal in rules.medals_for(circuit, time_ms):
            if medal not in had:
                gains.append(Gain("medal", rules.MEDAL_MONEY[medal], medal))
                profile.money += rules.MEDAL_MONEY[medal]
                profile.xp += rules.MEDAL_XP[medal]
        if rec is None:
            rec = Rt1Record(player_id=player_id, circuit=circuit)
            db.add(rec)
        rec.time_ms = time_ms
        rec.vehicle = vehicle
        rec.splits = splits
        # Sans fantôme pour ce temps, l'ancien reste : mieux qu'aucun fantôme à défier,
        # même s'il finit un peu après le record affiché.
        if ghost is not None:
            rec.ghost = ghost
        rec.set_at = datetime.now(UTC)
        await db.flush()

    gains += await _pay_missions(db, profile, bots, pi)
    if commit:
        await db.commit()
    return Arrival(
        record=is_record,
        best_ms=time_ms if is_record else old,
        gains=gains,
        level_before=level_before,
        state=await state(db, player_id),
    )


async def _pay_missions(
    db: AsyncSession, profile: Rt1Profile, bots: BotsResult | None = None, pi: int | None = None
) -> list[Gain]:
    """Paie les missions nouvellement accomplies (une fois chacune)."""
    bests = dict(
        (
            await db.execute(
                select(Rt1Record.circuit, Rt1Record.time_ms).where(
                    Rt1Record.player_id == profile.player_id
                )
            )
        ).all()
    )
    gains = []
    done = list(profile.missions)
    for mission in rules.MISSIONS:
        reached = mission.progress(bests, profile.finishes, profile.workshop) >= mission.count or (
            bots is not None and mission.beaten_by(bots.level, bots.count, bots.place, pi)
        )
        if mission.id not in done and reached:
            done.append(mission.id)
            gains.append(Gain("mission", mission.reward, mission.id))
            profile.money += mission.reward
            profile.xp += mission.xp
    profile.missions = done
    return gains


class NotOwned(Exception):
    pass


class GarageError(Exception):
    """Achat impossible ; le message est celui montré au joueur."""


async def _locked_profile(db: AsyncSession, player_id: uuid.UUID) -> Rt1Profile:
    # Verrou sur le joueur : deux requêtes simultanées ne paient pas deux fois la même
    # médaille ni ne dépensent deux fois le même argent.
    await db.scalar(select(Player.id).where(Player.id == player_id).with_for_update())
    profile = await db.get(Rt1Profile, player_id)
    if profile is None:
        profile = Rt1Profile(
            player_id=player_id,
            money=0,
            xp=0,
            finishes=0,
            missions=[],
            vehicles=[rules.STARTER],
            vehicle=rules.STARTER,
            workshop={},
        )
        db.add(profile)
    return profile


async def buy(db: AsyncSession, player_id: uuid.UUID, vehicle: str) -> State:
    """Achète un véhicule et le met en route."""
    profile = await _locked_profile(db, player_id)
    price, level = rules.VEHICLES[vehicle]
    if vehicle in profile.vehicles:
        raise GarageError("Ce véhicule est déjà au garage.")
    if rules.level_for(profile.xp) < level:
        raise GarageError("Niveau de pilote insuffisant.")
    if profile.money < price:
        raise GarageError("Pas assez d'argent.")
    profile.money -= price
    profile.vehicles = [*profile.vehicles, vehicle]
    profile.vehicle = vehicle
    await db.commit()
    return await state(db, player_id)


def _workshop(profile: Rt1Profile, vehicle: str) -> dict:
    """Copie modifiable de l'atelier d'un véhicule (niveaux, réglages, livrée)."""
    w = profile.workshop.get(vehicle) or {}
    out = {"levels": dict(w.get("levels", {})), "tune": dict(w.get("tune", {}))}
    if "livery" in w:
        out["livery"] = w["livery"]
    return out


async def upgrade(db: AsyncSession, player_id: uuid.UUID, vehicle: str, part: str) -> State:
    """Passe une pièce au niveau suivant, contre de l'argent."""
    profile = await _locked_profile(db, player_id)
    if vehicle not in profile.vehicles:
        raise NotOwned
    w = _workshop(profile, vehicle)
    level = w["levels"].get(part, 1)
    if level >= rules.MAX_LEVEL:
        raise GarageError("Cette pièce est déjà au maximum.")
    cost = rules.upgrade_cost(vehicle, level)
    if profile.money < cost:
        raise GarageError("Pas assez d'argent.")
    profile.money -= cost
    w["levels"][part] = level + 1
    # nouvel objet : la colonne JSON n'est enregistrée que si elle change d'identité
    profile.workshop = {**profile.workshop, vehicle: w}
    await _pay_missions(db, profile)
    await db.commit()
    return await state(db, player_id)


async def tune(
    db: AsyncSession, player_id: uuid.UUID, vehicle: str, key: str, value: float
) -> State:
    """Règle un réglage fin (-1 à +1), ouvert au niveau 5 de sa pièce."""
    profile = await _locked_profile(db, player_id)
    if vehicle not in profile.vehicles:
        raise NotOwned
    w = _workshop(profile, vehicle)
    if w["levels"].get(rules.TUNES[key], 1) < rules.MAX_LEVEL:
        raise GarageError("Réglage pas encore débloqué.")
    w["tune"][key] = round(max(-1.0, min(1.0, value)), 1)
    profile.workshop = {**profile.workshop, vehicle: w}
    await db.commit()
    return await state(db, player_id)


async def paint(db: AsyncSession, player_id: uuid.UUID, vehicle: str, livery: dict) -> State:
    """Enregistre la livrée d'un véhicule (peinture, jantes, vitres, numéro, logo)."""
    profile = await _locked_profile(db, player_id)
    if vehicle not in profile.vehicles:
        raise NotOwned
    w = _workshop(profile, vehicle)
    w["livery"] = livery
    profile.workshop = {**profile.workshop, vehicle: w}
    await db.commit()
    return await state(db, player_id)


async def select_vehicle(db: AsyncSession, player_id: uuid.UUID, vehicle: str) -> State:
    profile = await _locked_profile(db, player_id)
    if vehicle not in profile.vehicles:
        raise NotOwned
    profile.vehicle = vehicle
    await db.commit()
    return await state(db, player_id)


@dataclass
class Entry:
    rank: int
    pseudo: str
    avatar: str
    time_ms: int
    has_ghost: bool
    vehicle: str


@dataclass
class Board:
    total: int
    entries: list[Entry]
    me: Entry | None


async def leaderboard(db: AsyncSession, circuit: str, limit: int, me: str | None) -> Board:
    """Le classement d'un circuit : le meilleur temps de chacun ; à temps égal, le
    premier à l'avoir signé passe devant."""
    order = (Rt1Record.time_ms.asc(), Rt1Record.set_at.asc())
    ranking = (
        select(
            Player.pseudo,
            Player.pseudo_key,
            Player.avatar,
            Rt1Record.time_ms,
            Rt1Record.ghost.is_not(None).label("has_ghost"),
            Rt1Record.vehicle,
            func.row_number().over(order_by=order).label("rank"),
            func.count().over().label("total"),
        )
        .join(Player, Player.id == Rt1Record.player_id)
        .where(Rt1Record.circuit == circuit)
        .subquery()
    )
    wanted = ranking.c.rank <= limit
    if me is not None:
        wanted = or_(wanted, ranking.c.pseudo_key == me.lower())
    rows = (await db.execute(select(ranking).where(wanted).order_by(ranking.c.rank))).all()

    def entry(r) -> Entry:
        return Entry(
            rank=r.rank,
            pseudo=r.pseudo,
            avatar=r.avatar,
            time_ms=r.time_ms,
            has_ghost=r.has_ghost,
            vehicle=r.vehicle,
        )

    return Board(
        total=rows[0].total if rows else 0,
        entries=[entry(r) for r in rows if r.rank <= limit],
        me=next((entry(r) for r in rows if me is not None and r.pseudo_key == me.lower()), None),
    )


async def ghost(db: AsyncSession, circuit: str, pseudo: str) -> tuple[Rt1Record, str] | None:
    """Le record d'un pilote sur un circuit et son pseudo tel qu'il l'écrit."""
    row = (
        await db.execute(
            select(Rt1Record, Player.pseudo)
            .join(Player, Player.id == Rt1Record.player_id)
            .where(Rt1Record.circuit == circuit, Player.pseudo_key == pseudo.lower())
        )
    ).first()
    return None if row is None else (row[0], row[1])
