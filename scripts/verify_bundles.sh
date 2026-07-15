#!/usr/bin/env bash
set -euo pipefail

echo "Verifying Tauri build bundles in expected locations..."
paths=("src-tauri/target/release/bundle" "target/release/bundle")
found=0

for p in "${paths[@]}"; do
  if [ -d "$p" ]; then
    echo "Found bundle directory: $p"
    find "$p" -maxdepth 3 -type f -print || true
    found=1
  else
    echo "Not present: $p"
  fi
done

if [ $found -eq 0 ]; then
  echo "No bundles found. Run 'npm run build' or 'tauri build' first." >&2
  exit 2
fi

echo "If you expect specific installer names, check for them, e.g.:"
echo "  find src-tauri/target -type f -iname '*.dmg' -o -iname '*.exe' -o -iname '*.AppImage'"
