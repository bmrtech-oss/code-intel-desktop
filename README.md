# Tauri + Vanilla

[![CI Build](https://github.com/bmrtech-oss/code-intel-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/bmrtech-oss/code-intel-desktop/actions/workflows/ci.yml)

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Development

Quick commands to develop and build the app locally:

- Install JavaScript dependencies (if using npm/pnpm/yarn):

```bash
npm install
# or pnpm install
# or yarn
```

- Run the Tauri dev environment (hot reload):

```bash
npm run dev
# or the equivalent script in package.json (e.g. `dev`)
```

- Build a production bundle:

```bash
npm run build
```

Note: this project contains both Node frontend files and a Rust `src-tauri` backend. The repository `.gitignore` was updated to exclude build artifacts such as `node_modules`, `target/`, `src-tauri/target/`, `.env` files, and common editor/OS files.

## Release and CI

A GitHub Actions workflow is provided to build native bundles and create a GitHub Release when you push a semantic version tag (tags starting with `v`, e.g. `v1.2.3`).

To create a release locally and trigger CI:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The workflow runs builds on `ubuntu-latest`, `windows-latest`, and `macos-latest`, then attaches the produced bundles to the GitHub Release. If you need automatic version bumping, let me know and I can add a `workflow_dispatch` job that calculates the next semver and tags the repo for you.

### Automated tagging

There is a `workflow_dispatch` workflow available: `Tag and Trigger Release` that can compute a semver bump (`patch`, `minor`, `major`) or accept a `manual_version` input. Running it will create a `vX.Y.Z` tag and push it; the `Release Binaries` workflow will run on the pushed tag.

Example (from Actions UI): choose `release_type=patch` and run the workflow.

### Code signing & notarization

The release workflow supports optional code signing for Windows and notarization for macOS when the following repository secrets are set:

- `WIN_SIGNING_CERT` — base64-encoded PFX certificate for Windows code signing
- `WIN_SIGNING_PASSWORD` — PFX password
- `APPLE_API_KEY` — Apple API key file contents (p8) as the secret value
- `APPLE_API_KEY_ID` — Apple API key id
- `APPLE_API_KEY_ISSUER_ID` — Apple issuer id

The workflows include conditional steps that run signing/notarization only when these secrets are present. You should verify and adjust the signing commands to match your installer names and signing provider requirements. If you want, I can add automated steps to decrypt a cert from GitHub Secrets, or integrate with third-party signing services.

### CI caching

The release workflow now caches common dependencies to speed up builds:

- Rust: `~/.cargo/registry` and `~/.cargo/git` (cache key based on `Cargo.lock`)
- Node: `node_modules` (cache key based on `package-lock.json`)

This should reduce CI time for subsequent runs. If you use `pnpm` or `yarn`, we can adjust the cache keys/paths to match your lockfile and package manager.

### Release notes automation

Release notes are now drafted automatically using Release Drafter. It runs on merged pull requests and pushes to `main` and creates a draft release that you can review before publishing.

### Add required secrets

To enable signing/notarization, add the following repository secrets under Settings → Secrets → Actions:

- `WIN_SIGNING_CERT` (base64 PFX)
- `WIN_SIGNING_PASSWORD`
- `APPLE_API_KEY` (p8 file contents)
- `APPLE_API_KEY_ID`
- `APPLE_API_KEY_ISSUER_ID`

And verify `GITHUB_TOKEN` has default permissions for Release Drafter to create/update drafts (default is usually fine).
