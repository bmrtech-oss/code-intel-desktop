# Phased Backend Implementation Plan & AI Agent Prompts

This document provides a highly structured, phased implementation roadmap specifically for the `code-intel` backend service (`https://github.com/bmrtech-oss/code-intel`) to support all features of the `code-intel-desktop` integration. Each step is represented by a **hyper-specific, context-aware prompt** designed to be consumed directly by an AI software engineer (e.g., Google Jules) working on the backend Python repository.

---

## Phase 1: Environment Status Invariants (Status Handshake)
**Goal:** Enhance the API connection handshake to carry deployment-specific boundary metadata, enabling the Tauri client to auto-detect its execution environment.

### Task 1.1: Environment Metadata status Payload
* **Files to modify:** `code_intel/api/server.py`
* **Prompt:**
> **Context:** We are preparing the `code-intel` backend to support native Tauri desktop client environments. The client needs to automatically detect if the server is running inside Docker or natively on the host to configure its path-mapping and shared volumes properly.
> **Task:**
> 1. In `code_intel/api/server.py`, enhance or implement a lightweight `GET /api/status` or `GET /status` endpoint.
> 2. The endpoint must return a structured JSON dictionary:
>    ```json
>    {
>      "status": "active",
>      "version": "1.0.0",
>      "is_docker": true,
>      "allowed_volumes": ["/repo", "/shared"],
>      "extractor_version": "1.0.0"
>    }
>    ```
> 3. Detect `is_docker` dynamically by checking if `/.dockerenv` exists on the filesystem, or via a fallback environment variable `IS_DOCKER=true`.
> 4. Ensure CORS policies allow incoming connections from Tauri's local origin: `tauri://localhost` and `http://tauri.localhost`.

---

## Phase 2: Progress Streaming & Git Cloning Ingestion
**Goal:** Implement real-time progress reporting during AST parsing and support seamless remote Git clone target ingestion.

### Task 2.1: Real-time progress SSE Channel
* **Files to modify:** `code_intel/api/server.py`, `code_intel/worker/tasks.py`
* **Prompt:**
> **Context:** Desktop clients need real-time feedback during long-running repository AST parsing. Standard polling creates lag. We want to implement a Server-Sent Events (SSE) progress streaming channel.
> **Task:**
> 1. In `code_intel/api/server.py`, implement an SSE streaming endpoint `GET /analyze/stream?job_id={job_id}`.
> 2. It must return a `StreamingResponse` with media type `text/event-stream`.
> 3. Connect the SSE generator to the Redis job status. In `code_intel/worker/tasks.py`, during the AST visitor walk phase, write current parsing progress (e.g., `current_file_name`, `parsed_count`, `total_files`) into a Redis status key named `progress:{job_id}`.
> 4. The SSE generator on the API server will poll this Redis key every 500ms and yield progress updates:
>    ```json
>    { "file": "main.py", "progress": 42, "done": false }
>    ```
> 5. When the ingestion task finishes, write `"done": true` to Redis so the generator can close the connection cleanly.

---

## Phase 3: Secure In-Memory LLM Configuration Handshake
**Goal:** Enable on-the-fly LLM configuration sync from the frontend Settings panel without storing sensitive credentials in persistent storage.

### Task 3.1: Transient LLM Key Handshake Endpoint
* **Files to modify:** `code_intel/api/server.py`, `code_intel/core/udf.py`
* **Prompt:**
> **Context:** When the developer saves their LLM credentials (Provider, Model Name, API Key) in the Settings panel of the Tauri UI, the backend must apply these settings dynamically to async `/requirements` or semantic summaries tasks without persistently saving credentials on-disk.
> **Task:**
> 1. In `code_intel/api/server.py`, add a `POST /config/llm` endpoint.
> 2. The endpoint accepts a JSON payload:
>    ```json
>    {
>      "provider": "openai",
>      "model": "gpt-4",
>      "api_key": "sk-proj-..."
>    }
>    ```
> 3. **Transient Memory Security Mandate:** Securely write these parameters to the active Redis workspace session cache under a key like `llm_config:{session_id}` with a 1-hour TTL. **Do not** write these keys to log files, standard standard out console messages, or PostgreSQL database tables.
> 4. Modify `LLMUDF` in `code_intel/core/udf.py` to check this Redis key before falling back to default environment variables (e.g., `LLM_API_KEY`) when constructing LLM completion clients.

---

## Phase 4: Git-DAG Timeline and Tree Metadata Exporter
**Goal:** Query the topological SQL read models and expose repository directory trees and commit histories.

### Task 4.1: Branches and Commits History Exporter
* **Files to modify:** `code_intel/api/server.py`, `code_intel/core/workspace.py`
* **Prompt:**
> **Context:** To support the client's Timeline Travel features, we need to expose the available branches and a chronological ancestry track of commit nodes from our Git-DAG database tables.
> **Task:**
> 1. In `code_intel/api/server.py`, add an endpoint `GET /repo/branches-and-commits?repo_path=<path_or_url>`.
> 2. Query the workspace manager to list all branches.
> 3. Perform a recursive lookup over the `parent_of` commit relationships in SQL (or utilize `SimpleGraphEngine`) to compile the chronological commit timeline representing the branch tip ancestry.
> 4. Return an array of commit nodes:
>    ```json
>    [
>      { "sha": "a7b8c9", "author": "Jules", "date": "2026-07-16T12:00:00Z" }
>    ]
>    ```

### Task 4.2: Bitemporal File Tree API
* **Files to modify:** `code_intel/api/server.py`
* **Prompt:**
> **Context:** The Tauri client needs to draw a sidebar folder file-tree that dynamically represents which files existed in the repository at a selected commit SHA.
> **Task:**
> 1. In `code_intel/api/server.py`, implement an endpoint `GET /repo/tree?version=<commit_sha>`.
> 2. Query the relational facts database (or the optimized Read Model) for all `FileNode` instances where `introduced_in` is in the commit ancestry and `deleted_in` is either null or not in the ancestry.
> 3. Aggregate the active file paths into a nested directory JSON tree structure:
>    ```json
>    {
>      "src": {
>        "type": "folder",
>        "children": {
>          "main.py": { "type": "file", "path": "src/main.py", "symbols": ["FQN1", "FQN2"] }
>        }
>      }
>    }
>    ```
> 4. Return this hierarchical tree payload to the client.

---

## Phase 5: Level-of-Detail (LOD) Graph Controller
**Goal:** Deliver a high-performance, segmented graph payload to avoid frontend canvas rendering bottlenecks.

### Task 5.1: Level-of-Detail Graph JSON Exporter
* **Files to modify:** `code_intel/api/server.py`
* **Prompt:**
> **Context:** Rendering massive, dense call graphs instantly is a rendering bottleneck on the frontend. We want our graph exporter to support progressive, depth-limited Level-of-Detail (LOD) queries.
> **Task:**
> 1. In `code_intel/api/server.py`, implement a dedicated endpoint `GET /graph?version=<commit_sha>&level=<file|all>`.
> 2. If `level=file` (default):
>    * Query the optimized Read Model for only `FileNode` nodes and directory dependencies (using `CONTAINS` and file imports). Exclude individual function-level call nodes entirely.
> 3. If `level=all`:
>    * Return the entire network, but strictly restrict the payload to nodes within a maximum radial depth of 1 from a specified focus symbol: `GET /graph?version=SHA&focus_symbol=FQN`.
> 4. Standardize the response format into a clean Cytoscape-friendly payload:
>    ```json
>    {
>      "nodes": [
>        { "id": "file:main.py", "label": "main.py", "type": "file" }
>      ],
>      "edges": [
>        { "source": "file:main.py", "target": "file:auth.py", "type": "imports" }
>      ]
>    }
>    ```
