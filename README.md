<div align="center">

<img src="frontend/public/logo.svg" width="128" alt="Le spot 3.0" />

# Le spot 3.0

**Cartes, dés et mauvaise foi.**
Une plateforme de jeux en temps réel, pensée pour le téléphone.

[games.matthieuguiot.dev](https://games.matthieuguiot.dev)

![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=nextdotjs&logoColor=fff)
![React](https://img.shields.io/badge/React_19-20232a?logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=fff)
![Tailwind](https://img.shields.io/badge/Tailwind_4-0f172a?logo=tailwindcss&logoColor=38bdf8)
![Python](https://img.shields.io/badge/Python_3.12-3776ab?logo=python&logoColor=fff)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=fff)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169e1?logo=postgresql&logoColor=fff)
![PWA](https://img.shields.io/badge/PWA-0c2c22?logo=pwa&logoColor=fff)

</div>

On entre un pseudo, on choisit un jeu, on ouvre une table et on partage son code à quatre
chiffres. Pas de compte, pas d'e-mail : un pseudo, un avatar, un code PIN. Une seule
application installable, une seule identité, un module par jeu.

## Les jeux

| | Jeu | Joueurs | En bref | Doc |
|---|---|---|---|---|
| 🂡 | **Nine to One** | 2 à 5 | Pose plus fort ou ramasse tout. Bots entraînés par renforcement. | [→](docs/nine-to-one/README.md) |
| ⚔️ | **Goulag** | 2 à 6 | Deux cartes de vie, une de défense. Attaque, charge ou blinde-toi. | [→](docs/goulag/README.md) |
| 🎲 | **Perudo** | 2 à 6 | Dés sous le gobelet, enchères et bluff, en 3D. | [→](docs/perudo/README.md) |
| 🃏 | **Solitaire** | 1 | Klondike chronométré, donnes gagnantes en option, victoire rejouée par le serveur. | [→](docs/solitaire/README.md) |
| ♟️ | **Échecs** | 2 | Elo, bots Stockfish de 800 à 2500 dans le navigateur, analyse de partie. | |
| 🏁 | **RT1** | 1 à 8 | Course contre la montre en Nouvelle-Calédonie, de Nouméa à Poum. *En développement.* | [→](docs/rt1/README.md) |

## Architecture

```mermaid
flowchart LR
    P["📱 PWA<br/>Next.js 16"] -- "REST + WebSocket" --> N["nginx<br/>Cloudflare"]
    N --> F["Next<br/>:3003"]
    N --> B["FastAPI<br/>:8003"]
    B --> T[("Tables<br/>en mémoire")]
    B --> D[("PostgreSQL<br/>profils · stats")]
```

- **Le serveur est seul juge.** Le client envoie des intentions (`{"action": …}`) et reçoit
  à chaque changement une vue filtrée : jamais les cartes des autres.
- **Tables en mémoire**, dans un seul processus uvicorn. Jamais de `--workers`.
- **Jeux solo** (Solitaire) : joués en local, le serveur tire la donne, tient le chrono et
  rejoue les coups pour valider la victoire.
- **Mobile d'abord** : sur téléphone, l'app exige l'installation en PWA ; sur ordinateur,
  le navigateur suffit.

```
backend/app/
  core/         config, base, JWT, rate limiting
  players/      identité pseudo + PIN, stats et classements par jeu
  rooms/        tables : sièges, WebSocket, chat, emotes, timer, revanche, bots
  admin/        le bureau : joueurs, tables, maintenance
  games/        base.py (contrat GameSpec), registry.py, un dossier par jeu
frontend/src/
  app/          routes : / (identité), /games, puis /<slug>
  games/        un dossier par jeu : écrans, socket, moteur client
  components/   partagés : avatars, cartes, chat, feuilles, chargements
  lib/          api, identité, catalogue des jeux (games.ts), sons, i18n FR/EN
ml/             entraînement des bots (torch, hors production)
docs/           un dossier par jeu : règles, arbitrages, architecture
deploy/         systemd, nginx, page de maintenance
```

## Démarrer en local

```bash
docker compose up -d                        # PostgreSQL sur 127.0.0.1:5435

cd backend
cp .env.example .env                        # DATABASE_URL → games:games@127.0.0.1:5435/games
uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --port 8004 --reload

cd frontend
echo 'NEXT_PUBLIC_API_URL=http://localhost:8004' > .env.local
pnpm install && pnpm dev                    # http://localhost:3003
```

Qualité : `uv run pytest`, `uv run ruff check app`, `pnpm lint`. Docker ne sert qu'en
local, la prod utilise le PostgreSQL du VPS.

## Ajouter un jeu

Identité, tables, sièges, WebSocket, reconnexion, chat, timer, revanche, stats et PWA
existent déjà. Un jeu n'écrit que ses règles, sa vue et ses écrans.

| Côté | À écrire |
|---|---|
| **Backend** `app/games/<slug>/` | `engine/` (règles pures, testées) · `views.py` (ce que voit chaque siège) · `spec.py` (une `GameSpec`) · une ligne dans `registry.py` |
| **Frontend** `src/games/<slug>/` | `types.ts` · `socket.ts` (`useRoomSocket`) · les écrans · deux routes dans `src/app/<slug>/` · une entrée dans `lib/games.ts` |
| **Doc** | `docs/<slug>/README.md` |

Les stats sont stockées par slug : pas de migration pour un nouveau jeu. Un jeu solo sans
table passe par `SOLO_GAMES` et ses propres routes, comme le Solitaire.

## Production

Un VPS Ubuntu 24.04 avec nginx, certbot, PostgreSQL, uv, Node 22 et pnpm installés, derrière
Cloudflare. L'instance de référence tourne sur `games.matthieuguiot.dev`.

| | |
|---|---|
| Dossier | `/var/www/games` |
| Services | `games-backend` :8003 · `games-frontend` :3003, sous l'utilisateur `app-games` |
| Base | rôle et base PostgreSQL `games` |

### Mettre à jour

```bash
cd /var/www/games && ./deploy.sh
```

1. **Avant** : ouvrir le bureau (`/admin`, onglet Maintenance) et lancer la maintenance.
   Plus personne ne lance de partie ; quand la dernière se termine, le bureau affiche
   « Tu peux déployer ».
2. `deploy.sh` enchaîne `git pull`, `uv sync`, migrations, build du front dans
   `.next-build` puis bascule d'un coup, et redémarre les services. L'app se recharge seule
   sur la nouvelle version.
3. En cas de souci : `./rollback.sh` remet le commit et le build précédents. Les migrations
   ne sont pas défaites, `alembic downgrade` à la main si besoin.

Si `deploy.sh` lui-même a changé, faire `git pull` à part avant de le lancer. Le code
appartient à `matthieu`, le service lit et n'écrit que dans `frontend/.next` et
`backend/logs` (`umask 022` pour le code, `umask 002` pour le build).

<details>
<summary><b>Installation du site</b></summary>

#### 0. DNS

Chez Cloudflare, zone `matthieuguiot.dev` : un enregistrement **A**
`games.matthieuguiot.dev → IP du VPS`, proxié (le pare-feu n'accepte le challenge certbot
que via Cloudflare).

#### 1. PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE games WITH LOGIN PASSWORD 'MOT_DE_PASSE_FORT';
CREATE DATABASE games OWNER games;
REVOKE CONNECT, TEMP ON DATABASE games FROM PUBLIC;
```

#### 2. Code

Une deploy key GitHub dédiée, en lecture seule, sur `Defint4/Games` :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_games -C "vps-games-deploy" -N ""
cat ~/.ssh/github_games.pub          # à coller dans Settings → Deploy keys
```

Dans `~/.ssh/config` :

```
Host github-games
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_games
    IdentitiesOnly yes
```

```bash
git clone github-games:Defint4/Games.git /var/www/games
```

#### 3. Backend

```bash
cd /var/www/games/backend
cp .env.example .env && nano .env
```

```
DATABASE_URL=postgresql+asyncpg://games:MOT_DE_PASSE_FORT@localhost:5432/games
ENVIRONMENT=production
CORS_ORIGINS=["https://games.matthieuguiot.dev"]
JWT_SECRET=<python3 -c "import secrets; print(secrets.token_urlsafe(48))">
BOT_TIME_BUDGET=0.5
BOT_THREADS=1
```

`JWT_SECRET` fait au moins 32 caractères, sinon l'API refuse de démarrer.
`BOT_TIME_BUDGET` et `BOT_THREADS` bornent le CPU du bot Difficile de Nine to One.

```bash
uv sync && uv run alembic upgrade head && mkdir -p logs
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8003   # test, puis Ctrl+C
curl http://127.0.0.1:8003/api/health                          # {"status":"ok"}
```

Le service lance `.venv/bin/uvicorn` directement : le durcissement systemd interdit le
cache d'uv, ne pas passer par `uv run` dans `ExecStart`.

#### 4. Frontend

```bash
cd /var/www/games/frontend
cp .env.example .env.production
pnpm install --frozen-lockfile && (umask 002 && pnpm build)
```

`NEXT_PUBLIC_API_URL` est embarquée au build : REST et WebSocket passent par nginx sur le
même domaine.

#### 5. Utilisateur du service et droits

```bash
sudo useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --user-group app-games
sudo usermod -aG app-games matthieu              # effectif à la prochaine session SSH
d=/var/www/games
sudo chgrp -R app-games $d && sudo chmod -R g-w,o-w $d && sudo find $d -type d -exec chmod g+s {} +
sudo chmod -R g+w $d/frontend/.next $d/backend/logs
sudo chmod 640 $d/backend/.env $d/frontend/.env.production
```

Pas `games` : ce compte existe déjà sur Ubuntu.

#### 6. Services

```bash
sudo cp /var/www/games/deploy/games-{backend,frontend}.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now games-backend games-frontend
```

#### 7. Certificat et nginx

```bash
sudo certbot certonly --nginx -d games.matthieuguiot.dev
sudo cp /var/www/games/deploy/nginx-games.conf /etc/nginx/sites-available/games
sudo ln -s /etc/nginx/sites-available/games /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

La config est complète et s'appuie sur les fichiers communs du serveur (`snippets/tls.conf`,
format de log `main`, IP réelle Cloudflare). WebSockets ouverts une heure sans trafic,
keepalive vers l'API et Next, et pendant un redémarrage nginx sert
`deploy/maintenance.html` (503, rechargement automatique) plutôt qu'une 502.

#### 8. Le bureau

`/admin` n'est ouvert qu'au compte désigné, avec son PIN **et** un mot de passe propre au
panneau (le compte doit exister dans l'app) :

```bash
cd /var/www/games/backend
.venv/bin/python -m app.admin set-password <pseudo>    # 12 caractères minimum
.venv/bin/python -m app.admin remove                   # retirer l'administrateur
```

Mot de passe haché en base, redemandé après 30 jours sans visite.

</details>

<details>
<summary><b>Commandes utiles</b></summary>

```bash
sudo journalctl -u games-backend -f
sudo journalctl -u games-frontend -f
sudo systemctl restart games-backend games-frontend
curl https://games.matthieuguiot.dev/api/health
curl https://games.matthieuguiot.dev/api/status           # état de la maintenance
sudo -u postgres psql -d games                            # console SQL de prod
sudo -u postgres pg_dump -Fc games > games-$(date +%F).dump   # export de la base
sudo -u postgres pg_restore --clean -d games games-AAAA-MM-JJ.dump
```

</details>
