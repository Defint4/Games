#!/usr/bin/env bash
# Régénère les modèles et la lumière cuite de RT1 dans public/rt1/.
# Blender 4.5 LTS (portable, BLENDER=chemin sinon ~/.local/opt/…) + gltf-transform.
set -euo pipefail
cd "$(dirname "$0")"

BLENDER=${BLENDER:-$HOME/.local/opt/blender-4.5.14-linux-x64/blender}
SAMPLES=${SAMPLES:-256}
OUT=.out
PUB=../../public/rt1

blend() { "$BLENDER" -b --factory-startup -P "$1" -- "${@:2}" 2>&1 | grep -E "^\[lm|counts|Error|Traceback|rror" || true; }

if [ -z "${SKIP_BLENDER:-}" ]; then
  blend level.py --out "$OUT/noumea" --samples "$SAMPLES" --lm 2048
  blend car.py --out "$OUT/cars"
fi

mkdir -p "$PUB/noumea" "$PUB/cars"
opt() {
  npx -y @gltf-transform/cli@4.5.0 optimize "$1" "$2" --compress meshopt --flatten false --join false \
    --instance false --palette false --simplify false --texture-compress false \
    --prune-attributes false >/dev/null
}
opt "$OUT/noumea/level.glb" "$PUB/noumea/level.glb"
opt "$OUT/noumea/flora.glb" "$PUB/noumea/flora.glb"
opt "$OUT/cars/starter.glb" "$PUB/cars/starter.glb"
cp "$OUT"/noumea/{lm_terrain.webp,lm_road.webp,lm_props.webp,water.png,heights.bin,level.json} "$PUB/noumea/"
cp "$OUT/cars/starter_shadow.png" "$PUB/cars/"

# Version des fichiers (cache navigateur d'une semaine sur /rt1)
V=$(cat "$PUB"/noumea/* "$PUB"/cars/* | sha1sum | cut -c1-10)
printf '/* Généré par assets/rt1/build.sh : change quand les modèles changent. */\nexport const ASSET_VERSION = "%s";\n' "$V" \
  > ../../src/games/rt1/assetVersion.ts
du -sh "$PUB"/noumea/* "$PUB"/cars/*
