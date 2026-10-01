#!/usr/bin/env bash
# Régénère les modèles et la lumière cuite de RT1 dans public/rt1/.
# Blender 4.5 LTS (portable, BLENDER=chemin sinon ~/.local/opt/…), gltf-transform, toktx.
# SAMPLES=128 pour aller vite, SKIP_CARS=1 pour ne refaire que les circuits, SKIP_BLENDER=1
# pour ne refaire que l'optimisation, CIRCUITS="noumea le-col" pour une partie.
set -euo pipefail
cd "$(dirname "$0")"

BLENDER=${BLENDER:-$HOME/.local/opt/blender-4.5.14-linux-x64/blender}
# KTX-Software (toktx) : cartes de lumière en KTX2, décompressées par le GPU du téléphone
TOKTX=${TOKTX:-$HOME/.local/opt/KTX-Software-4.4.2-Linux-x86_64/bin/toktx}
SAMPLES=${SAMPLES:-256}
OUT=.out
PUB=../../public/rt1

LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT

# Lance un script Blender ; un échec (code de sortie ou exception Python, que Blender ne
# remonte pas toujours) arrête le build au lieu de recopier les anciens fichiers de .out.
blend() {
  if ! "$BLENDER" -b --factory-startup -P "$1" -- "${@:2}" >"$LOG" 2>&1 || grep -q "Traceback" "$LOG"; then
    tail -n 40 "$LOG"
    echo "build.sh : $1 a échoué" >&2
    exit 1
  fi
  grep -E "^\[lm|^\[veh|counts|Error|rror" "$LOG" || true
}

CIRCUITS=${CIRCUITS:-"noumea centre-ville le-col la-corniche"}

if [ -z "${SKIP_BLENDER:-}" ]; then
  for c in $CIRCUITS; do
    blend level.py --circuit "$c" --out "$OUT/$c" --samples "$SAMPLES" --lm 2048
  done
  if [ -z "${SKIP_CARS:-}" ]; then
    blend car.py --out "$OUT/cars"
    # dimensions des véhicules : une seule source, sim/vehicles.ts
    ../../node_modules/.bin/jiti specs.ts > "$OUT/specs.json"
    blend vehicles.py --out "$OUT/cars" --specs "$OUT/specs.json" --thumbs 1
    blend vehicles.py --out "$OUT/cars" --specs "$OUT/specs.json" --only starter --thumbs 1
  fi
fi

mkdir -p "$PUB/cars"
# positions sur 16 bits (le niveau « high » les mettait sur 14 : pas de 8 cm sur le terrain),
# normales sur 10 bits (8 faisaient des paliers dans les reflets de la peinture)
opt() {
  ../../node_modules/.bin/gltf-transform meshopt "$1" "$2" --level medium \
    --quantize-position 16 --quantize-normal 10 >/dev/null
}
# Carte de lumière en KTX2 ETC1S (sRGB, mips) : 4 bits par pixel sur le GPU au lieu de 32.
lm() {
  "$TOKTX" --t2 --encode etc1s --clevel 2 --qlevel 230 --assign_oetf srgb --genmipmap "$2" "$1"
}
for c in $CIRCUITS; do
  mkdir -p "$PUB/$c"
  opt "$OUT/$c/level.glb" "$PUB/$c/level.glb"
  opt "$OUT/$c/flora.glb" "$PUB/$c/flora.glb"
  for m in lm_terrain lm_road lm_props; do lm "$OUT/$c/$m.png" "$PUB/$c/$m.ktx2"; done
  rm -f "$PUB/$c"/lm_*.webp
  cp "$OUT/$c"/{water.png,heights.bin,probe.bin,level.json} "$PUB/$c/"
done
# le décodeur Basis de three, servi avec les fichiers du jeu
mkdir -p "$PUB/basis"
cp ../../node_modules/three/examples/jsm/libs/basis/basis_transcoder.{js,wasm} "$PUB/basis/"
for glb in "$OUT"/cars/*.glb; do
  opt "$glb" "$PUB/cars/$(basename "$glb")"
done
cp "$OUT"/cars/*_shadow.png "$OUT"/cars/*.webp "$PUB/cars/"

# Version des fichiers (cache d'un an sur /rt1, adresses en ?v=)
../../node_modules/.bin/jiti version.ts
du -sh "$PUB"/*

# Contrôles : route sous le terrain, sens des colliders (voir check.ts)
../../node_modules/.bin/jiti check.ts $CIRCUITS
