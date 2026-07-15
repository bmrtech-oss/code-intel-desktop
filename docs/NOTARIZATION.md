# Notarization & Code Signing Guide

This document covers macOS notarization and Windows code signing for CI and local builds.

## macOS Notarization

Purpose
- Apple scans and notarizes your app to reduce Gatekeeper warnings for users outside the Mac App Store.

Prerequisites
- Apple Developer Program membership (paid).
- An API key from App Store Connect (AuthKey .p8), Key ID, and Issuer ID.
- The artifact must be code-signed with a Developer ID Application certificate before submission.

Secrets / env variables (recommended)
- `APPLE_API_KEY` — contents of the `.p8` private key (base64 or raw).
- `APPLE_API_KEY_ID` — the Key ID from App Store Connect (e.g. ABCDE12345).
- `APPLE_API_KEY_ISSUER_ID` — your Issuer ID (UUID).

Typical workflow steps (local)
```bash
# write key to file
echo "$APPLE_API_KEY" > /tmp/AuthKey.p8

# submit artifact and wait for notarization
xcrun notarytool submit /path/to/YourApp.dmg --key /tmp/AuthKey.p8 --key-id $APPLE_API_KEY_ID --issuer $APPLE_API_KEY_ISSUER_ID --wait

# staple the notarization ticket to the artifact
xcrun stapler staple /path/to/YourApp.dmg
```

CI snippet (example for `release.yml`)
```yaml
env:
  APP_KEY: ${{ secrets.APPLE_API_KEY }}
  KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
  ISSUER: ${{ secrets.APPLE_API_KEY_ISSUER_ID }}

steps:
  - name: Write Apple API key
    run: echo "$APP_KEY" > /tmp/AuthKey.p8

  - name: Submit for notarization
    run: |
      artifact=$(find src-tauri/target -type f \( -iname "*.dmg" -o -iname "*.pkg" -o -iname "*.app" \) | head -n1 || true)
      if [ -n "$artifact" ]; then
        xcrun notarytool submit "$artifact" --key /tmp/AuthKey.p8 --key-id "$KEY_ID" --issuer "$ISSUER" --wait || true
        xcrun stapler staple "$artifact" || true
      else
        echo "No macOS artifact found to notarize"
      fi
```

Common failures
- Notarization rejected: inspect logs in App Store Connect and the `notarytool` output.
- "No code signature": ensure `codesign` was run with a valid Developer ID cert.
- Invalid key/IDs: verify Key ID and Issuer ID in App Store Connect.

## Windows Code Signing

Purpose
- Sign Windows executables/installers so users and SmartScreen see verified publisher information.

Prerequisites
- A code signing certificate (PFX) exported from your CA or AD CS.
- Password for the PFX.

Secrets / env variables (recommended)
- `WIN_SIGNING_CERT` — base64 of the PFX file.
- `WIN_SIGNING_PASSWORD` — password for the PFX.

Typical workflow steps (local)
```powershell
# decode base64 PFX to file (PowerShell)
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:WIN_SIGNING_CERT)) | Out-File -Encoding Byte signing.pfx

# sign an exe with osslsigncode (on Windows) or signtool
# Example with osslsigncode (install via choco):
# osslsigncode sign -pkcs12 signing.pfx -pass "<password>" -n "code-intel-desktop" -i "https://example.com" -t http://timestamp.digicert.com -in unsigned.exe -out signed.exe
```

CI snippet (example for `release.yml`)
```bash
env:
  WIN_SIGNING_CERT: ${{ secrets.WIN_SIGNING_CERT }}
  WIN_SIGNING_PASSWORD: ${{ secrets.WIN_SIGNING_PASSWORD }}

steps:
  - name: Prepare Windows signing
    run: |
      if [ -z "$WIN_SIGNING_CERT" ] || [ -z "$WIN_SIGNING_PASSWORD" ]; then
        echo "Windows signing secrets not configured; skipping."
        exit 0
      fi
      echo "$WIN_SIGNING_CERT" | base64 -d > signing.pfx
      choco install -y osslsigncode || true
      exe=$(find src-tauri/target -type f -iname "*.exe" | head -n1 || true)
      if [ -n "$exe" ]; then
        osslsigncode sign -pkcs12 signing.pfx -pass "$WIN_SIGNING_PASSWORD" -n "code-intel-desktop" -i "https://example.com" -t http://timestamp.digicert.com -in "$exe" -out "$exe.signed" || true
      else
        echo "No .exe found to sign"
      fi
```

Common failures
- Missing PFX or wrong password: verify secrets and base64 encoding.
- Timestamp server issues: try alternate timestamp URL or retry.

## Troubleshooting & Tips
- Always test signing/notarization locally before CI by reproducing the same steps.
- Keep private keys and PFXs in GitHub Secrets, not in the repository.
- For macOS, confirm `codesign` identity exists on the runner (CI uses macOS runners which can access Keychain if configured).

## References
- Apple notarization docs: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution
- osslsigncode docs / signtool docs for Windows signing
