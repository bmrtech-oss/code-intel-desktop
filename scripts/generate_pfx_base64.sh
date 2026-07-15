#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 path/to/cert.pfx [output_base64_file]"
  exit 1
fi

pfx="$1"
out="${2:-cert.pfx.base64}"

if [ ! -f "$pfx" ]; then
  echo "File not found: $pfx"
  exit 2
fi

base64 -w0 "$pfx" > "$out"
echo "Wrote $out"
echo
echo "Copy the following value into the WIN_SIGNING_CERT secret (base64):"
echo "----BEGIN BASE64----"
cat "$out"
echo "----END BASE64----"
echo
echo "Example gh CLI commands to set secrets (run locally):"
echo "gh secret set WIN_SIGNING_CERT --body \"\\$(cat $out)\""
echo "gh secret set WIN_SIGNING_PASSWORD --body \"<PFX_PASSWORD>\""
