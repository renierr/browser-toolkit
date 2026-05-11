---
name: tool-creation
description: Create or add a new tool for browser-toolkit.
when_to_use: User asks to add/create/build a new tool in src/tools/*.
triggers:
  - add a tool
  - new tool
  - create a tool
  - build a tool
  - can you make a tool
keywords:
  - src/tools
  - config.json
  - template.html
  - index.ts
  - init cleanup
  - bun x tsc
---

## When to use me

Use this skill when user wants to create or add a new tool to browser-toolkit.

**Trigger phrases:**

- "add a tool"
- "new tool"
- "create a tool"
- "build a tool"
- "I need a tool that..."
- "can you make a [X] tool?"

**Recognition patterns:**

- User describes functionality that doesn't exist in TOOLS.md
- User asks "we should add..." or "let's add..."
- User wants features available in other browser toolkits but not here

## Workflow

1. Plan first-ask questions only when requirements are unclear
2. Check src/tools/* for similar tools first to find reusable patterns
3. Use Bun only (not npm/pnpm)
4. Keep tool code browser-only and offline-first by default. Use the optional backend when feature requirements need server-side capability.
5. Ask before adding dependencies when unclear
6. Create required files: config.json, template.html, index.ts (only if JS needed)
7. If tool depends on backend, set "requiresBackend": true and use `/api/*` via `fetchApi` / `fetchJson` / `fetchBlob` / `uploadFile` from `src/js/api.ts`
8. If backend endpoint is needed, add route in `backend/routes/*` and mount it in `backend/app.ts`
9. Run Bun validation steps before completing
10. Follow tool entry contract

Source of truth: follow `AGENTS.md` and `AGENTS.details.md` when any rule conflicts with this skill.

## Tool Entry Contract

export default function init(): void | (() => void) {
// setup
return () => {
// cleanup listeners/timers/observers
};
}

For share-target tools, init() may receive an optional payload:
import type { SharedFilesPayload } from '../../js/share-target';

export default function init(payload?: SharedFilesPayload): void | (() => void) {
if (payload?.sharedFiles?.length) {
// handle shared files
}
return () => {
// cleanup
};
}

## Required Files

- config.json: name, description, icon, sectionId, order, draft, example, hideHeader, hideFooter, shareTarget, requiresBackend
- template.html: tool UI markup
- index.ts: JS behavior (only when needed)

## Example config.json

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
"requiresBackend": false,
"shareTarget": {
"accept": ["image/*"]
}
}

## State and Listener Safety

Avoid:

- module-level tool state
- global listeners without cleanup

Prefer:

- local state inside init()
- listener binding on tool container
- event delegation on local container

Example:
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

Global listener exception (only when no local alternative):
export default function init(): void | (() => void) {
const onKeyDown = (event: KeyboardEvent): void => {
// keyboard shortcut handling
};

document.addEventListener('keydown', onKeyDown);

return () => {
document.removeEventListener('keydown', onKeyDown);
};
}

## Icons

Do not import/call Lucide rendering directly.
Use data-lucide and let the observer render automatically.
<i data-lucide="clipboard" class="w-4 h-4"></i>

## Styling

Prefer DaisyUI/Tailwind tokens:

- bg-base-100, text-base-content, border-base-300

Use dark: only when tokenized classes cannot express requirement.
Keep custom CSS minimal in src/css/style.css.

Do not use short internal DaisyUI variables like --p, --b1.
Use full variables:

- --color-primary, --color-primary-content
- --color-secondary, --color-secondary-content
- --color-accent, --color-accent-content
- --color-neutral, --color-neutral-content
- --color-base-100, --color-base-200, --color-base-300, --color-base-content

## Dropzone Pattern

<div
  id="dropzone"
  class="flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-base-200 dark:bg-gray-800 dark:border-gray-600 transition-colors p-3 min-h-40 group hover:bg-base-300"
>
  <div class="flex flex-col items-center gap-2 text-center transition-transform group-hover:scale-105">
    <!-- icon + text -->
  </div>
  <input type="file" class="hidden" />
</div>

Optional paste button for image tools:
<button id="paste-btn" class="btn btn-outline flex-1 sm:flex-none">
<i data-lucide="clipboard" class="w-4 h-4 mr-2"></i>
or click here to Paste from clipboard
</button>

## Browser API Availability Checks

Common checks before use:

- navigator.clipboard
- navigator.share
- window.showOpenFilePicker
- navigator.bluetooth
- navigator.serial
- navigator.usb

Example:
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

## Error Handling

- No empty catch blocks
- Log contextual errors: console.error('[MyTool] Failed to process:', error);
- Show clear user-facing feedback
- Validate input before processing
- Avoid throwing on malformed user input; show a message instead

## Shared Utilities

Use existing helpers in src/js/* before writing new ones. This list is not exhaustive; check src/js/* for newly added utilities.

Known utilities:

- src/js/file-utils.ts: dropzone handling and file download
- src/js/theme.ts: theme detection via data-theme
- src/js/utils.ts: shared generic helpers
- src/js/mime-types.ts: MIME detection
- src/js/share-target.ts: shared-file intake
- src/js/favorites.ts: read/write favorite tool state
- src/js/tool-config.ts: parse tool metadata from config.json

## Validation Commands

After creating tool:

- bun x tsc
- bun x tsc -p backend/tsconfig.json (if backend touched)
- bun x prettier --write <touched-file>
- bun run generate:tool-description
