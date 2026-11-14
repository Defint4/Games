"""La version en ligne, lue une fois au démarrage : deploy.sh redémarre le service après
chaque mise à jour."""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]


def _version() -> str | None:
    # Le dépôt appartient au compte de déploiement, le service tourne sous un autre : sans
    # safe.directory, git refuse de le lire (« dubious ownership ») et la version reste vide.
    repo = REPO
    try:
        out = subprocess.run(
            ["git", "-c", f"safe.directory={repo}", "log", "-1", "--format=%h %cI"],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


# « hash date » : de quoi vérifier dans le panneau admin qu'un déploiement est bien passé.
VERSION = _version()


def _online_build() -> str | None:
    """Le commit sur lequel le front en ligne a été construit, écrit dans son build par
    deploy.sh. C'est lui que l'app compare au sien (NEXT_PUBLIC_BUILD_ID) pour se recharger
    quand elle est restée ouverte sur une version précédente (frontend/src/lib/maintenance.ts).

    Surtout pas le commit du dépôt : il avance dès un `git pull`, sans que le front soit
    reconstruit. Au redémarrage suivant du backend, les deux ne correspondraient plus et
    toutes les apps ouvertes se rechargeraient en boucle jusqu'au prochain déploiement.
    Sans build (développement), le commit du dépôt fait l'affaire : le front n'y a pas
    d'identifiant à comparer."""
    try:
        build = (REPO / "frontend" / ".next" / "DEPLOYMENT_ID").read_text().strip()
    except OSError:
        build = ""
    return build or (VERSION.split(" ")[0] if VERSION else None)


COMMIT = _online_build()
