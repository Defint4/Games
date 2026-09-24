#!/usr/bin/env bash
# Mise à jour — à lancer sur le serveur depuis /var/www/games
set -euo pipefail
cd "$(dirname "$0")"

echo "==> git pull"
git pull

echo "==> Backend : dépendances + migrations"
cd backend
uv sync
uv run alembic upgrade head
cd ..

echo "==> Frontend : dépendances + build"
cd frontend
pnpm install --frozen-lockfile
# Build à côté du site en ligne, puis bascule d'un coup : pendant le build, le serveur
# continue de servir l'ancienne version intacte (un build en place effaçait ses fichiers
# sous les pieds des joueurs). L'identifiant de version (le commit) fait recharger
# proprement les apps restées ouvertes sur l'ancienne au lieu de les laisser planter.
rm -rf .next-build
# Les types générés pour la version en ligne (.next/types, inclus par tsconfig) décrivent
# ses pages : une page supprimée depuis ferait échouer la vérification du nouveau build.
# `next start` ne s'en sert pas.
rm -rf .next/types
VERSION="$(git rev-parse --short HEAD)"
NEXT_DIST_DIR=.next-build NEXT_DEPLOYMENT_ID="$VERSION" pnpm build
# Relu par next.config.ts au lancement de `next start` (voir deploymentId) : sans lui,
# les pages rendues à la demande partiraient sans identifiant de version.
echo "$VERSION" > .next-build/DEPLOYMENT_ID
# Les fichiers JS de la version précédente restent servis : une app restée ouverte qui
# en charge un à la demande (la 3D du Perudo…) le trouve encore. Sans écraser ceux du
# nouveau build.
if [ -d .next/static ]; then cp -r --update=none .next/static/. .next-build/static/; fi
rm -rf .next-old
if [ -d .next ]; then mv .next .next-old; fi
mv .next-build .next
cd ..

echo "==> Redémarrage des services"
sudo systemctl restart games-backend games-frontend

echo "==> Déploiement terminé"
sudo systemctl status games-backend games-frontend --no-pager -l | head -20
