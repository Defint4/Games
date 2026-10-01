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

CIRCUITS=${CIRCUITS:-"noumea centre-ville le-col la-corniche"}

if [ -z "${SKIP_BLENDER:-}" ]; then
  for c in $CIRCUITS; do
    blend level.py --circuit "$c" --out "$OUT/$c" --samples "$SAMPLES" --lm 2048
  done
  blend car.py --out "$OUT/cars"
  # dimensions des véhicules : une seule source, sim/vehicles.ts
  ../../node_modules/.bin/jiti specs.ts > "$OUT/specs.json"
  "$BLENDER" -b --factory-startup -P vehicles.py -- --out "$OUT/cars" --specs "$OUT/specs.json" --thumbs 1 2>&1 \
    | grep -E "^\[veh|Error|Traceback|rror" || true
  "$BLENDER" -b --factory-startup -P vehicles.py -- --out "$OUT/cars" --specs "$OUT/specs.json" --only starter --thumbs 1 2>&1 \
    | grep -E "^\[veh|Error|Traceback|rror" || true
fi

mkdir -p "$PUB/cars"
opt() {
  npx -y @gltf-transform/cli@4.5.0 optimize "$1" "$2" --compress meshopt --flatten false --join false \
    --instance false --palette false --simplify false --texture-compress false \
    --prune-attributes false >/dev/null
}
for c in $CIRCUITS; do
  mkdir -p "$PUB/$c"
  opt "$OUT/$c/level.glb" "$PUB/$c/level.glb"
  opt "$OUT/$c/flora.glb" "$PUB/$c/flora.glb"
  cp "$OUT/$c"/{lm_terrain.webp,lm_road.webp,lm_props.webp,water.png,heights.bin,level.json} "$PUB/$c/"
done
for glb in "$OUT"/cars/*.glb; do
  opt "$glb" "$PUB/cars/$(basename "$glb")"
done
cp "$OUT"/cars/*_shadow.png "$OUT"/cars/*.webp "$PUB/cars/"

# Version des fichiers (cache navigateur d'une semaine sur /rt1)
V=$(cat "$PUB"/*/* | sha1sum | cut -c1-10)
printf '/* Généré par assets/rt1/build.sh : change quand les modèles changent. */\nexport const ASSET_VERSION = "%s";\n' "$V" \
  > ../../src/games/rt1/assetVersion.ts
du -sh "$PUB"/*
