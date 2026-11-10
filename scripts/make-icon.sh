#!/bin/sh
# Renders build/icon.svg to build/icon.png (1024 px) and build/icon.icns.
# macOS only: uses the built-in `sips` (image conversion) and `iconutil` (icon sets).
set -eu
cd "$(dirname "$0")/../build"

sips -s format png icon.svg --out icon.png >/dev/null

iconset="$(mktemp -d)/icon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  double=$((size * 2))
  sips -z "$size" "$size" icon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  sips -z "$double" "$double" icon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o icon.icns
rm -rf "$(dirname "$iconset")"
echo "build/icon.png and build/icon.icns updated"
