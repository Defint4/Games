#!/usr/bin/env bash
# Retour à la version d'avant le dernier deploy.sh — à lancer sur le serveur depuis
# /var/www/games. Remet le code (commit noté dans .deploy-previous) et le build précédent
# du front (.next-old), puis redémarre. Les migrations ne sont PAS défaites : si la mise à
# jour en a appliqué une, `uv run alembic downgrade <révision>` à la main, après lecture.
set -euo pipefail
cd "$(dirname "$0")"

PREV="$(cat .deploy-previous)"
echo "==> Retour au commit $PREV"
git checkout --detach "$PREV"

echo "==> Backend : dépendances"
(cd backend && uv sync --locked)

echo "==> Front : build précédent"
cd frontend
if [ ! -d .next-old ]; then
  echo "Pas de .next-old : reconstruire avec deploy.sh après un git checkout." >&2
  exit 1
fi
rm -rf .next-bad
mv .next .next-bad
mv .next-old .next
cd ..

echo "==> Redémarrage des services"
sudo systemctl restart games-backend games-frontend
sudo systemctl status games-backend games-frontend --no-pager -l | head -20
echo "Revenir ensuite sur main (git checkout main) avant le prochain deploy.sh."
