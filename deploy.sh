#!/usr/bin/env bash
# Mise à jour — à lancer sur le serveur depuis /var/www/games
set -euo pipefail
cd "$(dirname "$0")"

# Le code appartient à matthieu et les services tournent sous `app-games` : tout ce qui est
# créé ici doit être lisible du groupe mais pas modifiable (README du portfolio, section 0).
umask 022

# Les tables vivent en mémoire du backend : le redémarrer hors maintenance efface les
# parties en cours, classées comprises. Le bureau (/admin, onglet Maintenance) doit
# afficher « Tu peux déployer ». Backend déjà tombé : rien à protéger, on continue.
# FORCE=1 ./deploy.sh pour passer outre.
phase="$(curl -fsS --max-time 5 http://127.0.0.1:8003/api/status 2>/dev/null \
  | sed -n 's/.*"maintenance":"\([a-z]*\)".*/\1/p')" || phase=""
if [ "${FORCE:-0}" != 1 ] && [ -n "$phase" ] && [ "$phase" != locked ]; then
  echo "Maintenance « $phase » : lance-la depuis le bureau et attends « Tu peux déployer »." >&2
  exit 1
fi

# Le commit en ligne avant la mise à jour : rollback.sh y revient.
git rev-parse HEAD > .deploy-previous

echo "==> git pull"
git pull --ff-only

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
# NEXT_PUBLIC_BUILD_ID : le commit connu du front, comparé à celui qu'annonce /api/status
# (une app restée ouverte sur l'ancienne version se recharge, voir lib/maintenance.ts).
# Le build est le seul dossier où le service écrit (cache d'images, pages régénérées) :
# créé en 664/775 pour le groupe du site, sans chmod après coup.
(
  umask 002
  NEXT_DIST_DIR=.next-build NEXT_DEPLOYMENT_ID="$VERSION" NEXT_PUBLIC_BUILD_ID="$VERSION" pnpm build
  # Relu par next.config.ts au lancement de `next start` (voir deploymentId) : sans lui,
  # les pages rendues à la demande partiraient sans identifiant de version.
  echo "$VERSION" > .next-build/DEPLOYMENT_ID
  # Les fichiers JS de la version précédente restent servis : une app restée ouverte qui
  # en charge un à la demande (la 3D du Perudo…) le trouve encore. Sans écraser ceux du
  # nouveau build.
  if [ -d .next/static ]; then cp -r --update=none .next/static/. .next-build/static/; fi
)
rm -rf .next-old
if [ -d .next ]; then mv .next .next-old; fi
mv .next-build .next
cd ..

# Dépendances et migrations juste avant le redémarrage : l'ancien backend ne tourne pas
# des minutes (le temps du build) sur un venv ou un schéma qu'il ne connaît pas.
echo "==> Backend : dépendances"
cd backend
uv sync --locked --no-dev
cd ..

echo "==> Sauvegarde des bases, puis migrations"
sudo -u postgres /usr/local/bin/pg-backup
(cd backend && .venv/bin/alembic upgrade head)

echo "==> Redémarrage des services"
sudo systemctl restart games-backend games-frontend

echo "==> Contrôle"
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fs -o /dev/null http://127.0.0.1:8003/api/health \
    && curl -fs -o /dev/null http://127.0.0.1:3003/; then
    ok=1
    break
  fi
  sleep 2
done
sudo systemctl status games-backend games-frontend --no-pager -l | head -20
if [ "$ok" != 1 ]; then
  echo "ÉCHEC : l'API ou le front ne répond pas. Revenir en arrière : ./rollback.sh" >&2
  exit 1
fi
# Cloudflare garde le HTML en cache : sans purge, il servirait encore l'ancienne version.
if [ -x /usr/local/bin/cf-purge ]; then /usr/local/bin/cf-purge; fi
echo "==> Déploiement terminé"
