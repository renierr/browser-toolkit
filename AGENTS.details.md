# Code Assist - Extended Reference

This file contains detailed examples and optional depth.

Read order:
1. `AGENTS.md` (core rules)
2. `AGENTS.details.md` (examples and deeper patterns)
3. `TOOLS.md` (full tool inventory from `src/tools/*/config.json`)
4. `docs/index.md` (full project docs)

## Project Overview

- Browser-only toolkit built with TypeScript and Vite.
- Tailwind CSS + DaisyUI for styling.
- No test framework in this project.
- PWA with offline-first behavior.

## PWA Constraints

- No CDN or online runtime loading.
- No backend services by default.
- Share target can provide files to tools.
- Service worker handles offline navigation and caching.

## Optional Backend Architecture

While the project is offline-first, it supports an **optional backend** using Bun + Hono.
This is meant for tools that strictly require a server (e.g. database interactions, heavy native computations).

1. **The `requiresBackend` flag:** 
   When creating a tool that needs the backend, you MUST set `"requiresBackend": true` in the tool's `config.json`.
2. **Environment Detection:**
   The frontend automatically checks for the backend on startup by pinging `/api/health`. 
   - If the backend is NOT detected (e.g., when hosted on GitHub Pages), any tool with `"requiresBackend": true` is **silently hidden** from the UI.
   - If the backend IS detected, the tools are shown and can safely fetch from `/api/*`.
3. **Backend Scaffolding:**
   The backend code lives in the `/backend` directory and uses Bun + Hono. Current structure:
   - `backend/server.ts`: Bun.serve bootstrap.
   - `backend/app.ts`: Hono app creation + route mounting.
   - `backend/routes/*.ts`: route modules.
   - `backend/lib/*.ts`: shared backend logic.
   The backend serves both API routes and the statically built frontend from `dist/`.
4. **Local Development with Backend:**
   In development, you must start BOTH the frontend and the backend. The Vite dev server (`bun run dev`) automatically proxies `/api` requests to the Bun server on port 3000.
   - Frontend: `bun run dev`
   - Backend: `cd backend && bun run dev`

## Backend Best Practices

- Keep route handlers thin; move reusable logic to `backend/lib/*`.
- Register routes centrally in `backend/app.ts` with clear path prefixes.
- Validate inputs and return consistent JSON error payloads.
- Use contextual logging (route or feature tag), no silent catch blocks.
- Keep Bun/Node APIs inside backend code; frontend remains browser-safe.

## Preferred Validation and Formatting

```bash
bun x tsc
bun x tsc -p backend/tsconfig.json
bun x prettier --write <touched-file-1> <touched-file-2>
```

Only use these when needed:

```bash
bun run build
bun run preview
```

Avoid global formatting unless explicitly requested:

```bash
bun x prettier --write <touched-file-1> <touched-file-2>
```

## Tool Lifecycle Model

1. Navigate using URL hash (example: `/#pdf-viewer`).
2. Tool `template.html` is injected.
3. Tool `index.ts` default `init()` runs (if present).
4. Optional shared files are passed when configured.
5. Cleanup runs on navigation away.

## Project Patterns

- App bootstrap and tool discovery live in `src/script.ts`.
- Tools are discovered lazily via `import.meta.glob(...)` (`config.json`, `template.html`, `index.ts`).
- Prefer the `html` tagged template from `src/js/utils.ts` for composing HTML strings.
- `data-setting` attributes on form controls are auto-bound by the framework (`src/js/render.ts:105` calls `settings.bind()`). Do **not** call `settings.bind()` in tool code — only add `data-setting="name"` to the element.
- Tool lifecycle cleanup/cancellation is orchestrated in `src/js/render.ts` (`currentToolCleanup`, `settingsCleanup`, `cancelPendingInit`).
- Do not reimplement your own global navigation lifecycle inside tools; return cleanup from `init()` instead.

## Tool Entry Contract

```ts
export default function init(): void | (() => void) {
  // setup

  return () => {
    // cleanup listeners/timers/observers
  };
}
```

For share-target tools, `init()` may receive an optional payload:

```ts
import type { SharedFilesPayload } from '../../js/share-target';

export default function init(payload?: SharedFilesPayload): void | (() => void) {
  if (payload?.sharedFiles?.length) {
    // handle shared files
  }

  return () => {
    // cleanup
  };
}
```

## New Tool Skeleton

Create:
- `src/tools/<tool-id>/config.json`
- `src/tools/<tool-id>/template.html`
- `src/tools/<tool-id>/index.ts` (only when JS behavior is needed)

Example `config.json`:

```json
{
  "name": "My Tool",
  "description": "Does something useful",
  "icon": "crop",
  "sectionId": "general",
  "order": 1,
  "draft": false,
  "example": false,
  "hideHeader": false,
  "hideFooter": false,
  "shareTarget": {
    "accept": ["image/*"]
  }
}
```

Notes:
- Use existing `sectionId` values when possible.
- `draft: true` hides tool from overview.
- `shareTarget.accept` supports wildcards.

## Template Includes

For larger tools, you can split the `template.html` into multiple files (partials).
All `.html` and `.css` files in the tool folder are automatically discovered and can be included.

- Use name of the file (e.g. `dialog.html`).
- Recursive includes are supported (one partial including another).
- CSS files should be included using `<include src="filename.css" type="style" />` which automatically wraps the content in a `<style>` tag and ensures cleanup when the tool is unmounted.

Example `template.html`:

```html
<div id="tool-root">
  <include src="header.html" />
  <main>...</main>
  <include src="footer.html" />
</div>

<include src="style.css" type="style" />
```

> [!NOTE]
> The `<include />` syntax is preferred as it allows Prettier to format the template correctly by treating includes as standard HTML elements.

## State and Listener Safety

Avoid:
- module-level tool state
- global listeners without cleanup

Prefer:
- local state inside `init()`
- listener binding on tool container
- event delegation on local container

Example:

```ts
export default function init(): void | (() => void) {
  const container = document.getElementById('tool-container');
  if (!container) return;

  const onClick = (event: Event): void => {
    // handle delegated click
  };

  container.addEventListener('click', onClick);

  return () => {
    container.removeEventListener('click', onClick);
  };
}
```

Global listener exception (only when no local alternative):

```ts
export default function init(): void | (() => void) {
  const onKeyDown = (event: KeyboardEvent): void => {
    // keyboard shortcut handling
  };

  document.addEventListener('keydown', onKeyDown);

  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
```

## Icons

Do not import/call Lucide rendering directly.
Use `data-lucide` and let the observer render automatically.

```html
<i data-lucide="clipboard" class="w-4 h-4"></i>
```

## Styling Guidance

Prefer DaisyUI/Tailwind tokens:
- `bg-base-100`
- `text-base-content`
- `border-base-300`

Use `dark:` only when tokenized classes cannot express the requirement.

Keep custom CSS minimal in `src/css/style.css`.

Do not use short internal DaisyUI variables like `--p`, `--b1`, etc.
Use full variables instead:
- `--color-primary`
- `--color-primary-content`
- `--color-secondary`
- `--color-secondary-content`
- `--color-accent`
- `--color-accent-content`
- `--color-neutral`
- `--color-neutral-content`
- `--color-base-100`
- `--color-base-200`
- `--color-base-300`
- `--color-base-content`

Opacity pattern:

```css
background-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
```

## Standard Dropzone Pattern

Keep this baseline class stack consistent with existing tools unless doing a deliberate migration.

```html
<div
  id="dropzone"
  class="flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-base-200 dark:bg-gray-800 dark:border-gray-600 transition-colors p-3 min-h-40 group hover:bg-base-300"
>
  <div class="flex flex-col items-center gap-2 text-center transition-transform group-hover:scale-105">
    <!-- icon + text -->
  </div>
  <input type="file" class="hidden" />
</div>
```

Optional paste button for image tools:

```html
<button id="paste-btn" class="btn btn-outline flex-1 sm:flex-none">
  <i data-lucide="clipboard" class="w-4 h-4 mr-2"></i>
  or click here to Paste from clipboard
</button>
```

## Error Handling

- No empty catch blocks.
- Log contextual errors:

```ts
console.error('[MyTool] Failed to process:', error);
```

- Show clear user-facing feedback.
- Validate input before processing.
- Avoid throwing on malformed user input; show a message instead.

## Browser API Availability Checks

Common checks:
- `navigator.clipboard`
- `navigator.share`
- `window.showOpenFilePicker`
- `navigator.bluetooth`
- `navigator.serial`
- `navigator.usb`

Example:

```ts
async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[Clipboard] Failed to write text:', error);
    return false;
  }
}
```

## Shared Utilities

Use existing helpers in `src/js/*` before writing new ones.

- `src/js/file-utils.ts` - dropzone handling and browser-side file download helpers.
- `src/js/theme.ts` - theme detection/toggle helpers via `data-theme`.
- `src/js/utils.ts` - shared generic helpers (timing, placeholders, and utility functions).
- `src/js/mime-types.ts` - MIME detection helpers from filename/content hints.
- `src/js/share-target.ts` - shared-file intake, lookup, and routing helpers.
- `src/js/favorites.ts` - read/write favorite tool state.
- `src/js/tool-config.ts` - parse/build tool metadata from `config.json`.

## More Documentation

- Full tool inventory: `TOOLS.md`
- Full docs: `docs/index.md`
- Core rules: `AGENTS.md`
