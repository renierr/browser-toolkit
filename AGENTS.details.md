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
- No backend services.
- Share target can provide files to tools.
- Service worker handles offline navigation and caching.

## Preferred Validation and Formatting

```bash
pnpm tsc
pnpm exec prettier --write <touched-file-1> <touched-file-2>
```

Only use these when needed:

```bash
pnpm build
pnpm preview
```

Avoid global formatting unless explicitly requested:

```bash
pnpm format
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
- Prefer `getSettings(toolId).bind(container)` from `src/js/settings.ts` for persisted form controls.
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
- CSS files should be included using `{{ style "filename.css" }}` which automatically wraps the content in a `<style>` tag and ensures cleanup when the tool is unmounted.

Example `template.html`:

```html
<div id="tool-root">
  {{ include "header.html" }}
  <main>...</main>
  {{ include "footer.html" }}
</div>

{{ style "style.css" }}
```

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

