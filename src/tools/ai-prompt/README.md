# AI Prompt Tool

On-device chat-style tool built on Chrome Prompt API (`LanguageModel`).

Primary API reference:

- https://developer.chrome.com/docs/ai/prompt-api?hl=de

This document explains:

- how the Prompt API works
- what memory model we use
- how this tool handles recovery and history
- where to extend next

## Purpose

`ai-prompt` provides a browser-native AI prompt experience with:

- model availability checks
- first-time model download handling
- streamed responses
- plain/markdown output rendering
- non-permanent session history with structured JSON
- hybrid memory strategy (native session memory + recovery replay)

## File Layout

`src/tools/ai-prompt/`

- `index.ts` - tool entrypoint, lifecycle, listeners, workflow orchestration
- `template.html` - UI layout
- `dom.ts` - DOM querying + UI rendering helpers
- `session-manager.ts` - Prompt API session lifecycle and streaming wrapper
- `support.ts` - feature detection and unsupported-browser messages
- `history-store.ts` - persisted in-session JSON storage (`sessionStorage`)
- `conversation-history.ts` - history domain logic and conversation transforms
- `types.ts` - shared types for API + history data
- `config.json` - tool metadata

## Chrome Prompt API Basics

Core object: `LanguageModel`

### 1) Availability

Call `LanguageModel.availability(options)` before creating a session.

Expected states:

- `unavailable` - cannot run on this browser/device/profile
- `downloadable` - model can be downloaded
- `downloading` - model currently downloading
- `available` - model ready

We pass the same modality options to `availability()` and `create()`:

- expected input: text
- expected output: text

### 2) Session creation

Call `LanguageModel.create({ monitor })` to create a session.

- `monitor` emits `downloadprogress` events (`loaded` 0..1)
- tool maps this to percentage and updates progress UI

### 3) Prompting

Use `session.promptStreaming(...)` and consume chunks with `for await`.

Supported input shapes in this tool:

- plain string prompt
- structured role messages (`system`, `user`, `assistant`)

### 4) Session memory behavior

Prompt API session has its own live context window.

- If you keep the same session, prior prompts are remembered automatically.
- If session is destroyed/recreated, native memory is lost.
- If context window fills, oldest context can be dropped by model internals.

### 5) Context/token telemetry

If exposed by browser build, session provides context metrics:

- `session.contextUsage`
- `session.contextWindow`
- `contextoverflow` event

Tool behavior:

- shows usage ratio and percentage in UI
- updates telemetry after prompts
- listens for `contextoverflow` and warns user
- notes that older turns may be dropped when overflow occurs

If browser does not expose these fields/events, tool keeps telemetry panel visible with fallback text.

## Our Memory Strategy (Hybrid)

We use **hybrid memory**, not replay-on-every-call.

### Normal path

- prompt sends only current user text (`string`)
- relies on native `LanguageModel` session memory

### Recovery path

When session is recreated and history exists:

- first next prompt sends role-message array:
  - system message
  - recent prior turns from stored history
  - current user prompt
- after successful recovery prompt, tool returns to native-memory mode

This keeps normal calls lean while preserving continuity after re-init.

## System Prompt

Defined in `index.ts` as `SYSTEM_PROMPT`.

Current behavior:

- included only in recovery replay message array
- not re-sent on every normal prompt

If you want stricter behavior, you can always send structured messages each time.

## Session History JSON (Structured)

Storage backend: `sessionStorage` (tab/browser-session scoped, non-permanent).

Key: `ai-prompt:session-history`

Schema version `1`:

```json
{
  "version": 1,
  "entries": [
    {
      "id": 1,
      "prompt": "user input",
      "response": "assistant output",
      "createdAt": 1715500000000,
      "updatedAt": 1715500005000,
      "status": "done"
    }
  ]
}
```

Entry statuses:

- `streaming`
- `done`
- `aborted`
- `error`

`history-store.ts` validates/parses schema and limits retained entries.

## Conversation History Domain Layer

`conversation-history.ts` contains no DOM logic.

Main methods:

- `list()` - current entries
- `startPrompt(prompt)` - create new streaming entry
- `appendResponse(id, chunk)` - append streamed chunk
- `markDone / markAborted / markError`
- `clear()`
- `toSessionData()` - export raw structured JSON object
- `toConversationMessages(maxEntries)` - convert history to role messages for recovery replay

This separation makes future agent workflows easy.

## UI Workflow

1. Detect Prompt API support.
2. Initialize model manually or auto-init if already available.
3. User submits prompt.
4. Create history entry (`streaming`).
5. Stream chunks:
   - update active output
   - append to history entry
6. Finalize entry status (`done` / `aborted` / `error`).
7. Render collapsible history entries.

History UI is session-scoped and cleared by `Clear output`.

## Output Rendering

- plain mode: raw text in `<pre>`
- markdown mode: shared renderer (`@js/markdown-content`) + markdown theme helpers

Output mode persisted via `data-setting="output-mode"` and global tool settings binder.

## Extension Notes

Good next steps:

1. Add a "recover context now" toggle/button.
2. Expose max replay turns in UI.
3. Add per-turn telemetry snapshots to history entries.
4. Add export/import for session history JSON.
5. Add optional per-thread history instead of one linear list.

## Constraints and Assumptions

- Browser-only tool, no backend required.
- Requires Chrome Prompt API availability.
- Model download may be large and hardware-dependent.
- History is intentionally non-permanent (`sessionStorage`, not `localStorage`).

## Current Workflow Summary

1. Check API support (`LanguageModel`).
2. Check availability and create session.
3. Attach listeners:
   - download progress
   - optional context overflow
4. Prompt flow:
   - normal: send plain text prompt (use native session memory)
   - recovery: replay limited structured history once after session recreation
5. Stream response chunks to current output + structured session history.
6. Refresh context telemetry panel from `contextUsage/contextWindow` when available.
