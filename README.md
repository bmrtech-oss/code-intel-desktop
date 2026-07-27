# Code-Intel Desktop Console

[![CI Build](https://github.com/bmrtech-oss/code-intel-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/bmrtech-oss/code-intel-desktop/actions/workflows/ci.yml)

An extremely performant, high-signal desktop explorer for code bases, utilizing **Tauri** and **Cytoscape.js** front-end visualization integrated with a local FastAPI + tree-sitter bitemporal AST backend database.

---

## ✨ Features & Architecture

In alignment with **100% Signal-vs-Noise** design principles, Code-Intel decouples dense code modules from ephemeral visualizations:

### 1. Zero-Noise Landing State
Upon initial startup, the Cytoscape workspace initializes as completely silent (with empty nodes and edges arrays), rendering a centered landing splash: *"Select a folder or symbol to begin exploring."*

### 2. Level-of-Detail (LOD) Interactive Topology
- **Initial Load:** To avoid rendering spaghetti-like clusters, the app requests high-level modules and file nodes only via `GET /graph?version={commit_sha}&level=file`.
- **Concentric Layout:** Files are positioned in a clean, high-contrast concentric ring pattern.
- **Lazy Symbol Expansion:** Double-clicking (`dbltap`) any file node retrieves its nested structural symbols (functions, classes, variables) via `POST /query` with `rule: "get_symbols"`, appending them dynamically as compound child nodes.
- **Real-time Dependency Edges:** When symbol nodes are loaded, the app queries complete detailed connections (`level=all`) and draws valid call/import edges connecting any visible elements.

### 3. Asynchronous Grounded Requirements SSE Stream
- **Multi-Node Scope Selection:** Support highlighting multiple symbols using `Shift+click` or box selection.
- **SSE Grounded Context Generation:** Sends selected symbol IDs to `/requirements/stream` via a standard `POST` stream.
- **Real-time Markdown Rendering:** Decodes and streams incoming markdown chunks using high-performance chunked `TextDecoder` and streams them dynamically into `#reqOutput`.
- **Traceability Verification:** On stream completion, displays LLM grounding verification scores and populates an interactive Traceability Matrix table linking requirement IDs to their AST code definition references.

### 4. Offline Graceful Degradation & Health Check
- If the server goes offline, the app triggers a viewport warning banner: *"Server Disconnected — Viewing Offline Local Cache."* while preserving active canvas instances in read-only mode.
- Retries `/status` every 10 seconds to auto-dismiss warning overlays when server connection is recovered.

---

## 🛠️ Local Development & Quick Start

### Prerequisites
- **Node.js** (v18+)
- **Python** (v3.11+)

### 1. Start the Code-Intel Backend (Port 8000)
Follow the [Backend Startup Guide](docs/backend-startup-guide.md) to set up and run the local FastAPI service on port `8000` with the SQLite compatibility patch:
```bash
cd /home/jules/code-intel
uv venv
source .venv/bin/activate
uv pip install -e .
# Apply SQLite patches and run server
DATABASE_URL=sqlite+aiosqlite:///codeintel.db uvicorn code_intel.api.server:app --host 127.0.0.1 --port 8000
```

### 2. Run the Tauri Desktop Client
Navigate to the root directory of this repository and install dependencies:
```bash
npm install
npm run dev
```

---

## 📸 Verification & Headless Testing

For visual verification, serving, and headless browser Playwright testing, the front-end files under `src/` can be locally served using python's built-in simple HTTP server on port `3000`:
```bash
python -m http.server 3000 --directory src
```

A sample visual verification script using Playwright is located under `/home/jules/verification/verify_landing.py`. Run it via:
```bash
python /home/jules/verification/verify_landing.py
```
This script automatically runs a headless Chromium browser instance, captures visual screenshots, and records webm videos of important user flows under `/home/jules/verification/`.
