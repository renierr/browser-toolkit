---
name: tool-creation
description: Create new browser-toolkit tools following project patterns
---

## When to use

User wants to create or add a new tool to browser-toolkit.

## Workflow

1. Plan first—ask user for requirements and confirm approach before implementing
2. Check src/tools/\* for similar tools first to find reusable patterns
3. Use pnpm (not npm)
4. Create required files: config.json, template.html, index.ts (only if JS needed)
5. Follow tool entry contract
6. Run pnpm tsc before completing

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

- config.json: name, description, icon, sectionId, order, draft, example, hideHeader, hideFooter, shareTarget
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

Use existing helpers in src/js/_ before writing new ones. This list is not exhaustive—check src/js/_ in plan mode for newly added utilities.

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

- pnpm tsc
- pnpm exec prettier --write <touched-file>
- pnpm generate:tool-description
