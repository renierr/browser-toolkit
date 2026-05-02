# Optional Backend Architecture

This document serves as the architectural reference for the optional backend implementation introduced to `browser-toolkit`. It details how the toolkit supports backend-dependent tools without breaking its offline, static-first nature.

## Goal

Add a backend server using Bun to allow the creation of backend-dependent tools (like interacting with a SQLite database or doing heavy computations), while keeping the frontend fully capable of running as a static site (e.g., on GitHub Pages) when the backend is not present.

## Architecture

1.  **Backend Runtime & Framework:**
    *   **Bun** as the runtime.
    *   **Hono** as the web framework to handle API routes and serve the static files.
2.  **Environment Detection (Frontend):**
    *   On startup, the frontend (`src/script.ts`) performs a fast, non-blocking `fetch('/api/health')` with a 1-second timeout.
    *   If it succeeds, it sets a flag indicating the backend is available. If it fails or times out, it assumes a purely static/offline environment.
3.  **Tool Configuration:**
    *   Tools that need the server set `"requiresBackend": true` in their `config.json`.
4.  **Conditional Tool Loading:**
    *   If the backend check fails, any tool with `requiresBackend: true` is silently filtered out from the tools list, keeping the UI clean for static deployments.
5.  **Local Development:**
    *   The Vite development server is configured to proxy `/api` requests to the Bun backend running on port 3000.

---

## Implemented Components

The following features and files were successfully added and modified to support this architecture:

### 1. Types & Configuration
- **`src/js/types.ts`**: Added `requiresBackend?: boolean;` to the `Tool` interface.
- **`src/js/tool-config.ts`**: Implemented parsing, validation, and assignment of the `requiresBackend` flag.

### 2. Frontend Boot Logic
- **`src/script.ts`**: 
  - Added the `fetch('/api/health')` check in the `boot()` sequence.
  - Modified `buildToolsList(isBackendAvailable)` to exclude tools requiring a backend when the backend is unreachable.

### 3. Backend Server
- **`backend/package.json`**: Initialized with Hono dependencies and scripts for starting the server (`bun start` and `bun run dev`).
- **`backend/server.ts`**: 
  - Created a Hono application.
  - Added an `/api/health` endpoint for the frontend ping.
  - Added an `/api/info` endpoint returning system metrics (used by the demo tool).
  - Added an `/api/db-test` SQLite example using `bun:sqlite` to demonstrate database interaction.
  - Configured `serveStatic` to effortlessly serve the frontend `dist/` folder.

### 4. Local Development Proxy
- **`vite.config.ts`**: Configured `server.proxy` to forward all `/api` requests to `http://localhost:3000` to allow simultaneous hot-module-replacement (Vite) and backend development.

### 5. Demo Tool
- **`src/tools/backend-info`**: Created a full example tool that fetches and displays data from `/api/info`. The tool hides itself in static environments by utilizing `"requiresBackend": true`.

### 6. Documentation & Agent Skills
- **`README.md`**: Added a detailed "Getting Started" section covering both Static/Offline Mode and Backend Mode.
- **`AGENTS.md` & `AGENTS.details.md`**: Documented the dual-mode architecture and the `requiresBackend` flag for future AI agents.
- **`docs/index.md`**: Updated with instructions on the optional backend server.
- **`.agents/skills/tool-creation/SKILL.md`**: Updated the tool creation workflow to mandate an offline-first preference, only utilizing the Bun backend if explicitly requested by the user.
