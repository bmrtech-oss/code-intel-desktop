Repository Secrets — Manual UI Setup

This document describes how to add the repository secrets required for Windows code signing and macOS notarization via the GitHub web UI, plus local commands to prepare the secret values.

## Secrets required

- `WIN_SIGNING_CERT` — base64-encoded PFX file (single-line base64 string).
- `WIN_SIGNING_PASSWORD` — password for the PFX file.
- `APPLE_API_KEY` — contents of your Apple `.p8` key file (raw text).
- `APPLE_API_KEY_ID` — Apple key id (e.g. `ABC123DEFG`).
- `APPLE_API_KEY_ISSUER_ID` — Apple issuer id (UUID string).

See the full notarization and signing guide for usage examples and CI snippets: [docs/NOTARIZATION.md](docs/NOTARIZATION.md)

## Prepare secret values locally

1. Create a base64-encoded PFX (Linux/macOS):

```bash
base64 -w0 path/to/cert.pfx > cert.pfx.base64
cat cert.pfx.base64  # copy this value into the UI
```

2. Create a base64-encoded PFX (PowerShell / Windows):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\cert.pfx')) > cert.pfx.base64
Get-Content cert.pfx.base64  # copy this value into the UI
```

3. Apple key contents (raw `.p8`):

```bash
cat AuthKey_XXXXXX.p8
# copy the entire output into the UI for APPLE_API_KEY
```

Record the `APPLE_API_KEY_ID` and `APPLE_API_KEY_ISSUER_ID` values from your Apple developer portal.

## Add secrets via GitHub web UI (manual)

1. Open your repository on GitHub.
2. Go to `Settings` → `Secrets and variables` → `Actions`.
3. Click `New repository secret`.
4. Enter the secret name (exactly as listed above) and paste the prepared value into the `Secret` field.
5. Click `Add secret`.
6. Repeat for each secret.

Notes:
- `WIN_SIGNING_CERT` should contain the base64 string created above (do not upload the binary file directly via the secret field).
- `APPLE_API_KEY` may be multi-line; the UI accepts multiline values — paste the `.p8` contents as-is.

## Add secrets via GitHub CLI (optional)

If you have `gh` installed and authenticated, you can set secrets from your terminal:

```bash
gh secret set WIN_SIGNING_CERT --body "$(cat cert.pfx.base64)"
gh secret set WIN_SIGNING_PASSWORD --body "yourPfxPassword"

gh secret set APPLE_API_KEY --body "$(cat AuthKey_XXXXXX.p8)"
gh secret set APPLE_API_KEY_ID --body "ABC123DEFG"
gh secret set APPLE_API_KEY_ISSUER_ID --body "00000000-0000-0000-0000-000000000000"
```

## Verify secrets and run a dry run

1. Confirm secrets are present in `Settings` → `Secrets and variables` → `Actions`.
2. Trigger a dry-run tag to validate workflows (this will run the Actions you added):

```bash
git tag v0.0.0-test
git push origin v0.0.0-test
```

3. In GitHub, open `Actions` → the `Release Binaries` run for the tag, and inspect logs for signing/notarization steps.

## Rotate or remove a secret

To rotate: update the secret value in the UI (click the secret and `Update secret`).
To remove: click the secret and `Delete secret`.

## Security recommendations

- Store only the values required for workflows (do not add extra sensitive files).
- Use repository-level secrets unless you need org-level reuse.
- Limit who can run workflows that use secrets by protecting branches or using environments with required reviewers.
- Rotate keys/certs periodically and after personnel changes.

## Troubleshooting

- If signing fails, check the Actions log for the exact command and error. Common issues: wrong password, incorrect cert format, or missing file pattern.
- For notarization errors, confirm your Apple API key and issuer/id are correct and that the app bundle was produced before notarization.

If you'd like, I can add a small helper script to generate `cert.pfx.base64` and a verification checklist you can run locally before pasting secrets.

## Helper scripts included

This repo includes simple helper scripts in `scripts/`:

- `scripts/generate_pfx_base64.sh` — bash script to base64-encode a `.pfx` and print the value for copying; outputs `cert.pfx.base64` by default.
- `scripts/generate_pfx_base64.ps1` — PowerShell equivalent for Windows.
- `scripts/verify_bundles.sh` — quick check that built bundles exist in `src-tauri/target/release/bundle` or `target/release/bundle` before you push a tag.

Usage examples:

```bash
# Create base64 PFX (Linux/macOS)
./scripts/generate_pfx_base64.sh path/to/cert.pfx

# Verify bundles locally (after building)
./scripts/verify_bundles.sh
```

## Run workflows manually

The GitHub workflows in this repository are configured to run manually via `workflow_dispatch`.

### UI method

1. Open the repository on GitHub.
2. Go to `Actions`.
3. Select the workflow (`CI Build` or `Release Binaries`).
4. Click `Run workflow`.
5. Choose the branch you want to run against (for example `ci/release-automation`).
6. Click `Run workflow`.

### CLI method (recommended from repo root)

If you have the GitHub CLI installed and authenticated, run from the repository root:

```bash
cd /d/D:/work-root/codebase/code-intel-desktop
gh workflow run ci.yml --ref ci/release-automation
```

If you run the command outside the repository, `gh` will fail with "not a git repository".

## See also

- Detailed signing and notarization steps: [docs/NOTARIZATION.md](docs/NOTARIZATION.md)

