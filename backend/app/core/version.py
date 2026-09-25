"""Le commit en ligne, lu une fois au démarrage : deploy.sh redémarre le service après
chaque mise à jour."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _version() -> str | None:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%h %cI"],
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


# « hash date » : de quoi vérifier dans le panneau admin qu'un déploiement est bien passé.
VERSION = _version()
# Le hash seul, celui que deploy.sh donne au build du front (NEXT_PUBLIC_BUILD_ID) : une
# app restée ouverte sur un autre se recharge (voir frontend/src/lib/maintenance.ts).
COMMIT = VERSION.split(" ")[0] if VERSION else None
