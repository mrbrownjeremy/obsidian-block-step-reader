#!/bin/zsh
# Build the plugin and install it into an Obsidian vault.
#
#   ./install.sh                 # installs into the Manuscript vault
#   ./install.sh /path/to/vault  # installs into another vault
#
# Any existing copy is backed up to <vault>/.obsidian/plugin-backups/ first.
# Settings (data.json) are kept. Reload the plugin in Obsidian afterwards.
set -euo pipefail

DEFAULT_VAULT="$HOME/Work/Projects/FMS-XX - AI Book/[AI Book] Working Files/Manuscript"
VAULT="${1:-$DEFAULT_VAULT}"
ROOT="${0:A:h}"
ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$ROOT/manifest.json")

if [[ ! -d "$VAULT/.obsidian" ]]; then
	echo "Not an Obsidian vault: $VAULT" >&2
	exit 1
fi

cd "$ROOT"
npm run build --silent

DEST="$VAULT/.obsidian/plugins/$ID"
if [[ -d "$DEST" ]]; then
	BACKUP="$VAULT/.obsidian/plugin-backups/$ID-$(date +%Y%m%d-%H%M%S)"
	mkdir -p "$BACKUP"
	cp -R "$DEST/." "$BACKUP/"
	echo "Backed up the previous install to $BACKUP"
fi

mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
echo "Installed $ID $(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' manifest.json) into $DEST"
echo "In Obsidian, turn the plugin off and on again (Settings → Community plugins) or run \"Reload app without saving\"."
