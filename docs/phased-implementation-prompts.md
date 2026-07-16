# Phased Implementation Plan & AI Agent Prompts

This document provides a highly structured, phased implementation roadmap for integrating `code-intel-desktop` with the `code-intel` backend. Each step is represented by a **hyper-specific, context-aware prompt** designed to be consumed directly by an AI software engineer (e.g., Google Jules) to implement changes in small, robust, and testable steps.

---

## Phase 1: Service Status Validation, Offline Resilience & Zero-State UI Setup
**Goal:** Establish secure communication between the Tauri desktop app and the backend, set up a quiet, distraction-free "zero-noise" visual home state, and handle endpoint disconnections gracefully.

### Task 1.1: Automated Backend Connection Discovery
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** We are integrating the `code-intel-desktop` Tauri frontend with our local FastAPI service (which defaults to port 8000). We need to replace the static host assumptions.
> **Task:**
> Update the `CodeIntelService` connection handshake in `src/main.js`:
> 1. On DOM load, issue an asynchronous fetch check to `http://localhost:8000/api/status` or `${service.baseUrl}/api/status`.
> 2. If the request succeeds, parse the response payload. If it indicates that the backend is containerized (running in Docker), save a variable `dockerMode = true` in local storage.
> 3. Update the bottom status bar: if connected, set `serverDot` background to green and `serverStatus` to "Connected"; if unreachable, set them to yellow/red and "Offline (Check Server)".
> 4. Ensure CORS header failures are caught gracefully and prompt an intuitive warning in the UI console.

### Task 1.2: Graceful Offline Degradation Guard
* **Files to modify:** `src/main.js`, `src/index.html`
* **Prompt:**
> **Context:** If the connection to the backend server is lost while a developer is exploring a codebase, we do not want the app to crash or throw unhandled promise exceptions.
> **Task:**
> 1. In `src/main.js`, wrap all fetch requests (like graph querying and file-tree loading) in a global error handler.
> 2. If a network connection error is encountered (e.g. `TypeError: Failed to fetch` or status Code 502/503), trigger an offline state.
> 3. Display a subtle, non-intrusive warning banner at the top of the viewport: `"Server Disconnected — Viewing Offline Local Cache."`
> 4. Do not clear the active Cytoscape canvas elements. Allow the developer to continue panning, clicking, and interacting with already-drawn nodes in read-only offline mode.
> 5. Periodically retry the `/status` ping in the background (every 10 seconds) and auto-dismiss the banner when the backend recovers.

### Task 1.3: Establish "Zero-Noise" State Default
* **Files to modify:** `src/main.js`, `src/index.html`
* **Prompt:**
> **Context:** In alignment with Signal-vs-Noise principles, we want the graph explorer canvas to be completely silent on initial launch, showing zero elements until a file or node is explicitly chosen.
> **Task:**
> 1. In `src/main.js`, remove all mock class, function, and relationship data records from the default `getGraph()` fallback method.
> 2. On application start, initialize Cytoscape.js with an empty `nodes` and `edges` array.
> 3. Display an intuitive centered splash message on the empty canvas: "Select a folder or symbol to begin exploring."

---

## Phase 2: Native & Remote Ingestion & Streaming Progress
**Goal:** Enable native directory selection via Tauri as well as remote Git clone targets, and replace polling with real-time stream feedback.

### Task 2.1: Native and Remote Git Selection Input
* **Files to modify:** `src/index.html`, `src/main.js`
* **Prompt:**
> **Context:** The developer should be able to analyze local folders as well as clone remote Git URL pathways (using HTTP or SSH links) into the workspace.
> **Task:**
> 1. In `src/index.html`, under the left sidebar "File Tree" section, add an alternative text-input box `#remoteRepoUrlInput` and branch-field `#remoteRepoBranchInput` with a triggering button `#cloneRemoteBtn`.
> 2. In `src/main.js`, configure a click handler for `#cloneRemoteBtn` that reads the Git URL and target branch.
> 3. Perform basic validation: if input matches standard Git syntax (HTTPS/SSH), execute a `POST /analyze` request passing `repo_path` (the Git URL) and `branch` (the target branch) to the backend API.
> 4. Ensure clicking the button enters an active ingestion state.

### Task 2.2: Native Directory Handshake (Tauri File Dialog)
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** Standard web browsers cannot access native system paths. We must use Tauri's native dialog API to browse local directories securely.
> **Task:**
> 1. In `src/main.js`, modify the click listener for the "Browse repo" button (`#browseRepoBtn`).
> 2. Replace the web directory input selection with a call to the Tauri native API: `window.__TAURI__.dialog.open({ directory: true, multiple: false })`.
> 3. Retrieve the returned absolute path (e.g., `/Users/username/my-project`).
> 4. If `dockerMode` is active, perform path translation check or prompt the user if the path is outside the shared Docker mount path.
> 5. Fire a `POST /analyze` request to the backend carrying the absolute system path.

### Task 2.3: Live Ingestion Stream Display
* **Files to modify:** `src/main.js`, `src/index.html`
* **Prompt:**
> **Context:** Polling `/status/{job_id}` is inefficient and lacks real-time granularity. We want to subscribe to a streaming endpoint to display real-time parsing progress.
> **Task:**
> 1. When the `POST /analyze` response returns a `job_id`, open a connection to the backend's EventSource/SSE channel: `new EventSource(`${baseUrl}/analyze/stream?job_id=${jobId}`)`.
> 2. Listen to stream events. When a progress payload is received, update a progress bar in the left file tree sidebar: e.g., `Ingesting: parser.go (42/100 files)`.
> 3. Upon receiving a completion token (`"done": true`), close the EventSource connection and trigger the workspace loading cycle.

---

## Phase 3: Dynamic LLM Settings Handshake & Timeline Travel
**Goal:** Synchronize saved LLM settings dynamically with the backend processing queue, and render historical repository contexts.

### Task 3.1: Save & Sync Settings Handshake (Secure In-Memory Keys)
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** When the developer configures their LLM credentials (Provider, Model Name, API Key) in the Settings panel, the backend needs to receive these settings dynamically so its asynchronous worker can invoke the proper LLM endpoint.
> **Task:**
> 1. In `src/main.js`, locate the save click handler of the Settings Modal (`#settingsSave`).
> 2. Read the saved Settings fields: Provider (e.g., `openai`, `openrouter`), Model Name (including custom entry), and the raw API Key.
> 3. When settings are saved successfully, issue a `POST` request to `${baseUrl}/config/llm` carrying:
>    ```json
>    {
>      "provider": "<provider>",
>      "model": "<model>",
>      "api_key": "<key>"
>    }
>    ```
>    *Architectural Instruction:* Warn the backend in system headers to hold these values *strictly in transient memory cache (RAM)* and never persist them into filesystem configurations or logging databases.
> 4. Catch failures gracefully; if the handshake fails, alert the user but preserve local storage configurations.

### Task 3.2: Branches & Commit History Rail
* **Files to modify:** `src/index.html`, `src/main.js`
* **Prompt:**
> **Context:** The developer needs a user interface to view and jump between different Git branches and specific historical commits.
> **Task:**
> 1. In `src/index.html`, add a select dropdown `#branchSelector` and a scrollable list `#commitTimelineRail` in the left sidebar under the Repository section.
> 2. In `src/main.js`, after successful ingestion, query `GET /repo/branches-and-commits?repo_path=<path_or_url>`.
> 3. Populate `#branchSelector` with returned branches.
> 4. Populate `#commitTimelineRail` with chronological commit cards showing the commit SHA, author, and timestamp.
> 5. Bind click listeners to the commit cards: clicking a commit SHA must set `service.currentCommitSHA = sha` and trigger a graph re-load for that snapshot.

### Task 3.3: Version-Filtered Repository Tree
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** The file tree directory structure should dynamically represent what files existed in the repository at the currently selected commit SHA.
> **Task:**
> 1. When a new commit SHA is selected, send a request to `GET /repo/tree?version=${commitSHA}`.
> 2. Parse the returned directory JSON object.
> 3. Rebuild the file tree in the sidebar element `#fileTree`.
> 4. Ensure each file tree leaf node includes a dataset property `data-symbols-list` containing the FQN of definitions nested inside that file.

---

## Phase 4: Level-of-Detail (LOD) Cytoscape Explorer
**Goal:** Render massive graphs fluidly by loading definitions only on demand.

### Task 4.1: Initial File Topology Load
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** To avoid rendering spaghetti-like graph clusters, we will only show FileNodes (the high-level system modules) on initial load.
> **Task:**
> 1. Implement a method `loadFileGraph(commitSHA)` in `src/main.js`.
> 2. Query `GET /graph?version=${commitSHA}&level=file`.
> 3. Render only FileNodes (representing directories and code files) in Cytoscape.js.
> 4. Apply a clean, high-contrast concentric or compound layout.

### Task 4.2: Lazy Symbol Expansion
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** We want the developer to zoom into definitions only on demand. Double-clicking a file node should expand its internal structural entities.
> **Task:**
> 1. Add a double-click listener (`dbltap`) to FileNodes in the Cytoscape workspace.
> 2. On double-click, retrieve the node's file path.
> 3. Query the backend: `POST /query` with `rule: "get_symbols"`, `commit_sha: commitSHA`, and `file_path: path`.
> 4. Add the returned symbols as child nodes of the parent FileNode in Cytoscape (using compound nodes).
> 5. Query call and import dependencies for the newly added symbols, and draw corresponding edges on the canvas.

---

## Phase 5: Grounded Requirements & Traceability Stream
**Goal:** Connect the interactive visualization to Ollama's asynchronous LLM generation pipeline.

### Task 5.1: Scope Definition & Stream Generation
* **Files to modify:** `src/main.js`
* **Prompt:**
> **Context:** We want the user to select specific code nodes and stream user stories generated by our local LLM.
> **Task:**
> 1. Support multi-node selection in Cytoscape using Shift+click or box-select.
> 2. Update the `#selectedNodesList` in the Requirements Workspace modal with the FQNs of all highlighted symbols.
> 3. On clicking "Generate Requirements" (`#generateReqBtn`), send a `POST` to the backend `/requirements/stream?version=${commitSHA}` with the body containing the list of selected symbol IDs.
> 4. Connect to the Server-Sent Events stream returned by the API.
> 5. Render incoming markdown chunks inside `#reqOutput` in real-time.
> 6. On stream completion, display the grounded verification scores and populate the Traceability Matrix table.
