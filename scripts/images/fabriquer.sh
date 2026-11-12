#!/bin/sh
# Fabrique l'image d'aperçu et les icônes de public/ à partir des pages de ce dossier, avec Chrome sans fenêtre.
# Usage : sh scripts/images/fabriquer.sh   (depuis la racine du projet ; demande Google Chrome installé)
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFIL="$(mktemp -d)"
OUT="$(cd ../../public && pwd)"
ICI="$(pwd)"

photo() { # photo <page avec paramètres> <largeur> <hauteur> <fichier>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFIL" \
    --force-device-scale-factor=1 --default-background-color=00000000 --virtual-time-budget=2000 \
    --window-size="$2,$3" --screenshot="$OUT/$4" "file://$ICI/$1" >/dev/null 2>&1
  echo "$4"
}

photo apercu.html 1200 630 apercu.png
photo 'icone.html?t=180&plein=1' 180 180 apple-touch-icon.png
photo 'icone.html?t=192' 192 192 icone-192.png
photo 'icone.html?t=512' 512 512 icone-512.png
photo 'icone.html?t=512&plein=1' 512 512 icone-maskable-512.png
rm -rf "$PROFIL"
