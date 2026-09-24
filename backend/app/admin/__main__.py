"""Le mot de passe du panneau d'administration, posé sur le serveur uniquement.

    .venv/bin/python -m app.admin set-password <pseudo>   crée ou change le mot de passe
    .venv/bin/python -m app.admin remove                  plus aucun administrateur

Le compte est désigné par son pseudo au moment de la commande, puis retenu par son id :
le renommer ensuite ne lui retire rien, et personne ne devient admin en prenant son
ancien pseudo. Un seul administrateur à la fois. Changer le mot de passe referme les
sessions admin ouvertes sur tous les appareils.
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import delete, select

from app.admin.models import AdminCredential
from app.admin.service import PASSWORD_MIN_LENGTH, set_password
from app.core.database import async_session_maker, engine
from app.players.models import Player


def _ask_password() -> str:
    first = getpass.getpass(f"Mot de passe admin ({PASSWORD_MIN_LENGTH} caractères minimum) : ")
    if len(first) < PASSWORD_MIN_LENGTH:
        sys.exit(f"Trop court : {PASSWORD_MIN_LENGTH} caractères minimum.")
    if getpass.getpass("Encore une fois : ") != first:
        sys.exit("Les deux saisies ne correspondent pas. Rien n'a changé.")
    return first


async def _set_password(pseudo: str) -> None:
    async with async_session_maker() as db:
        player = await db.scalar(select(Player).where(Player.pseudo_key == pseudo.lower()))
        if player is None:
            sys.exit(f"Aucun compte « {pseudo} ». Crée-le d'abord dans l'app.")
        other = await db.scalar(
            select(Player.pseudo)
            .join(AdminCredential, AdminCredential.player_id == Player.id)
            .where(Player.id != player.id)
        )
        if other is not None:
            sys.exit(f"« {other} » est déjà administrateur. `python -m app.admin remove` d'abord.")
        password = _ask_password()
        await set_password(db, player, password)
        print(f"Mot de passe admin enregistré pour « {player.pseudo} ».")
    await engine.dispose()


async def _remove() -> None:
    async with async_session_maker() as db:
        await db.execute(delete(AdminCredential))
        await db.commit()
    await engine.dispose()
    print("Plus aucun administrateur.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.admin")
    commands = parser.add_subparsers(dest="command", required=True)
    setter = commands.add_parser("set-password", help="crée ou change le mot de passe admin")
    setter.add_argument("pseudo")
    commands.add_parser("remove", help="retire l'administrateur")
    args = parser.parse_args()
    if args.command == "set-password":
        asyncio.run(_set_password(args.pseudo))
    else:
        asyncio.run(_remove())


main()
