# Code Assist - Project Rules & Context

## Role & Objective

You are a Senior Software Engineer. Your goal is to generate efficient, maintainable, secure, and scalable code.
**CRITICAL:** Before generating new code, always analyze the existing context to determine if similar functionality already exists. **Avoid redundancy at all costs.**
Answers should be short and concise. Check manually made changes of code edits before editing files.
Do not change unwanted areas of the existing code.

## Project Overview

This is a **Browser Toolkit** - a collection of browser-only tools built with TypeScript and Vite.
It uses Tailwind CSS + DaisyUI for styling. There is no test framework - do not write tests.

## PWA & Offline Distribution

This is a **Progressive Web App** deployed to GitHub Pages with full offline support.

### Key Constraints

- **No CDN or online loading**: All assets must be bundled or locally available. Never fetch external scripts, libraries, or data at runtime
- **No backend**: All logic runs entirely in the browser
- **Offline-first**: Service worker (Workbox) caches all assets for offline use
- **File handling**: Tools can receive files via PWA share target

### PWA Behavior

- Auto-updates in background (`registerType: 'autoUpdate'`)
- Works completely offline after initial load
- Share target receives files via `SharedFilesPayload` type
- Service worker handles offline navigation
- All data persists in browser storage (IndexedDB, localStorage)

## Commands

**Important:**

- Use **pnpm** only - never use npm

```bash
# Development (typically already running)
pnpm dev              # Start Vite dev server
pnpm preview          # Preview production build on port 5000

# Build & Type Check
pnpm build            # Run tsc (type check) + Vite build
pnpm tsc              # Type check only (tsc --noEmit)

# Formatting
pnpm format           # Format all source files with Prettier
pnpm format:check     # Check formatting without writing

# Utilities
pnpm clean            # Remove dist and node_modules/.vite
pnpm upgrade:check    # Check outdated dependencies
pnpm upgrade:deps    # Update dependencies to latest
```

**Note:** No ESLint configured - use `pnpm tsc` for type checking instead.

> **Important:** Skip the full build during development. Running `pnpm tsc` (type check only) is sufficient to verify correctness. Only run `pnpm build` when you absolutely must test the production build or preview with `pnpm preview`.

## AI Agent Guidelines

- **Don't assume libraries exist** - Check `package.json` first before using any package
- **Don't assume APIs exist** - Always check for browser APIs (`navigator.clipboard`, etc.)
- **Don't assume endpoints exist** - Tools are accessed via hash URL: `/#tool-folder-name`
- **Check existing code first** - Use grep to find similar implementations before writing new code
- **Check shared utilities** - Always look in `src/js/` before writing helper functions
- **Use standard error format**: `console.error('[ToolName] message')`
- **When uncertain, ask the user** - Don't guess at conventions
- **Be decisive** - When you have high confidence in a reasonable approach, proceed without asking. Only ask when tradeoffs are unclear or the task has significant ambiguity.

## Project Structure

```
src/
├── tools/                    # Each tool is a subfolder (becomes URL slug)
│   ├── my-tool/
│   │   ├── config.json       # Tool metadata (name, description, icon)
│   │   ├── template.html     # Tool UI layout
│   │   ├── index.ts          # Tool logic (optional)
│   │   └── package.json      # Tool-specific deps (optional)
│   └── ...
├── pages/                    # HTML entry points
├── components/                # Shared HTML components (header, footer)
├── js/                       # Shared utilities and types
├── css/                      # Global styles
├── config/                   # Site configuration
├── types/                    # Global TypeScript types
├── main.ts                   # Optional: project-level startup hook
└── script.ts                 # Main app entry point

> **Note on `main.ts`:** Rarely needed. Only useful for project-level setup (e.g., registering custom icons). Most tools don't need this.

> **Note on `src/pages/`:** Contains global HTML entry points (e.g., main index, PDF viewer). Most tools don't need a pages entry - tools are auto-discovered from `src/tools/`.
```

## Creating a New Tool

**Quick Summary (4 steps):**

1. **Create folder**: `src/tools/my-tool/`
2. **Add `config.json`**:

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

   | Field                  | Type     | Default          | Description                                                      |
   | ---------------------- | -------- | ---------------- | ---------------------------------------------------------------- |
   | **Required**           |
   | `name`                 | string   | (folder name)    | Tool name shown in overview + search                             |
   | `description`          | string   | "No description" | Tool description (powers search)                                 |
   | **Sorting & Grouping** |
   | `sectionId`            | string   | -                | Groups tool into a section (e.g., "general", "images", "pdf")    |
   | `order`                | number   | 0                | Position within section (ascending)                              |
   | **Visibility**         |
   | `draft`                | boolean  | false            | Hide from overview while building                                |
   | `example`              | boolean  | false            | Mark as template/demo tool                                       |
   | **Metadata**           |
   | `icon`                 | string   | -                | Lucide icon id (e.g., "crop", "image")                           |
   | **Layout**             |
   | `hideHeader`           | boolean  | false            | Hide site header for this tool                                   |
   | `hideFooter`           | boolean  | false            | Hide site footer for this tool                                   |
   | **PWA Share Target**   |
   | `shareTarget.accept`   | string[] | -                | MIME types to receive (e.g., `["image/*"]`, `"application/pdf"`) |

   **Notes:**
   - Any Lucide icon ID can be used (e.g., `"icon": "crop"`) - all Lucide icons are available automatically
   - Use existing `sectionId` values (e.g., `"general"`, `"images"`, `"pdf"`). Do not create new sections unless necessary. If a tool doesn't fit existing sections, warn the user.
   - `draft: true` hides the tool from the overview (useful while building)
   - `shareTarget.accept` supports wildcards: `"image/*"` matches all images, `"text/*"` matches all text types

3. **Add `template.html`**: Each tool must have a `template.html` file. This file is auto-discovered and injected into the page when the tool is accessed. All HTML, styles, and UI for the tool must be placed here. Use semantic HTML + DaisyUI components + Tailwind utilities. The UI should match the look and feel of existing tools.
4. **Add `index.ts`** (optional): Export `init()` function with cleanup support
   - UI-only → template.html only
   - Need JS/cleanup → add index.ts with init() function

**Critical: Cleanup Pattern (REQUIRED)**

If your tool attaches any global listeners, timers, or observers, you MUST return a cleanup function.

**AVOID these patterns:**

- **Module-level variables** - Persist across tool navigation and cause bugs
- **Global listeners on document/window** - Hard to track and cleanup
- **Global DOM elements** - Hard to manage lifecycle

**PREFERRED pattern - Use local tool DOM elements:**

- Attach listeners to tool-specific container elements, not document/window
- Tool DOM gets destroyed on navigation, automatically cleaning up listeners
- Use event delegation on a container element instead of individual global listeners

```ts
// Good - local to container, auto-cleaned on navigation
export default function init() {
  const container = document.getElementById('tool-container');
  const onClick = (e) => {
    /* ... */
  };
  container?.addEventListener('click', onClick);

  return () => container?.removeEventListener('click', onClick);
}

// Bad - global listener, hard to track and cleanup
export default function init() {
  document.addEventListener('keydown', handleKey); // Avoid this
  window.addEventListener('resize', handleResize); // Avoid this
}
```

```ts
export default function init() {
  const onKeyDown = (e: KeyboardEvent) => {
    /* ... */
  };
  document.addEventListener('keydown', onKeyDown);

  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
```

**Reference:** See `docs/index.md` for complete documentation on:

- Tool-specific dependencies (pnpm-workspace)
- Share targets (PWA file receiving)
- Ordering & section grouping
- Template placeholders
- Dark/Light mode with DaisyUI

## Tool Loading Architecture

### Hash-Based Routing

Tools are navigated via URL hash: `https://example.com/#my-tool` or `/#pdf-viewer`

### Auto-Discovery & Lazy Loading

- Tools are auto-discovered from `src/tools/*/config.json`
- Tool scripts are **lazy-loaded on demand** (not bundled into main chunk)
- Bundle size is not a concern - prioritize functionality over size
- Each tool's `index.ts` exports `init()` function called when tool activates

### Tool Lifecycle

1. User navigates to tool URL (e.g., `/#pdf-viewer`)
2. Tool's `template.html` is injected into the page
3. If tool has `index.ts`, its `init()` function is called
4. Tool receives files via `SharedFilesPayload` if configured
5. On navigation away, cleanup function is called (see "Cleanup Pattern" above)

### Module-Level State

**STRICT RULE: Do NOT create module-level variables for tool state.** They persist across tool navigation and cause bugs.

**All tool state (DOM refs, data, flags) MUST be declared inside the `init()` function.** The only exception is a module-level flag for one-time global setup (e.g., `let argon2Initialized = false`).

```ts
// WRONG - module-level state persists across navigation
let els: DOMEls | null = null;
let db: Kdbx | null = null;
let pendingFile: ArrayBuffer | null = null;

export default function init() {
  els = initDOM('app');
  // ...
}

// CORRECT - all state inside init()
export default function init() {
  const els = initDOM('app');
  if (!els) return;

  let db: Kdbx | null = null;
  let pendingFile: ArrayBuffer | null = null;

  // ... all logic here

  return () => {
    db = null;
    pendingFile = null;
  };
}
```

See [Cleanup Pattern](#cleanup-pattern) above — always return cleanup functions from `init()`.

### Lucide Icons

**NEVER manually call `createIcons()` or import `lucide`.** The project has a `MutationObserver` (in `src/js/tool-icons.ts`) that automatically detects and renders any `<i data-lucide="icon-name">` elements added to the DOM.

- **Static HTML in `template.html`**: Just use `<i data-lucide="icon-name">` — handled automatically
- **Dynamically injected HTML**: Just inject HTML with `data-lucide` attributes — the observer picks them up
- **Do NOT**: `import { createIcons } from 'lucide'`, `window.lucide.createIcons()`, or any dynamic `createIcons()` call
- **Exception**: If you need to update an icon that was already rendered (e.g., toggling eye/eye-off), just replace the innerHTML with a new `<i data-lucide="...">` — the observer will handle it

## Code Style Guidelines

### Language

- **English Only:** All code (variable names, method names, class names) AND all comments/documentation must be written in **English**.

### TypeScript

- **Use modern, non-deprecated APIs.** Avoid deprecated libraries or methods.

- **Strict mode enabled** (`strict: true` in tsconfig)
- **Use `type` over `interface`** for object definitions (aligns with erasableSyntaxOnly)
- **Use explicit return types** for exported functions
- **Avoid `any`**; use `unknown` if necessary
- **Use `readonly` modifiers** for immutability

### Imports

- Use **relative imports** (e.g., `import { foo } from '../utils'`)
- No path aliases configured in this project
- Import types with `import type` to avoid runtime overhead

### File Naming

- **kebab-case** for all files (e.g., `pdf-viewer.ts`, `my-tool.config.json`)
- Descriptive names that indicate purpose

### Naming Conventions

- **Variables/functions**: camelCase
- **Types/interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE or camelCase with prefix (e.g., `defaultConfig`)

### Comments

- **JSDoc** only for public APIs and complex logic
- Keep comments concise and in English
- Avoid obvious comments (e.g., `// Increment counter`)

### Formatting (Prettier)

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

**Run Prettier on specific files only:**

```bash
pnpm exec prettier --write src/tools/my-tool/index.ts src/tools/my-tool/template.html
```

**Never run global format** (`pnpm format` without args) - it processes all files.

## Browser-Specific Guidelines

### No Node.js APIs

This is a **browser-only toolkit**. Avoid Node.js-specific APIs:

- NO `fs`, `path`, `os`, `child_process`, `crypto` (Node.js modules)
- Use `fetch` instead of file system operations
- Use `URL` and `URLSearchParams` for URL manipulation
- Use IndexedDB for persistent storage (not local files)
- Use Web APIs only (`Blob`, `FileReader`, `crypto.subtle`, etc.)

### Module-Level Variables

**Do not create module-level variables** - they persist across tool navigation and cause bugs.
If needed, always clean them up. The cleanup handling pattern exists for this reason.

### WASM Memory Management

If using WebAssembly, free and destroy variables and allocated memory when done.

**WASM modules in this project:**

- Vite aliases configured: `@ffmpeg`, `pandoc-wasm`, `onnx`
- Use dynamic imports for lazy loading WASM modules
- Check for WASM support before use

### index.ts Orchestration

The `index.ts` in each tool is for orchestration and DOM/listener management.
Extract utility functions into separate files within the tool folder.

### Modern Browser APIs

Use modern browser features freely - no polyfills needed. Always check for API availability and provide user feedback when unavailable.

```typescript
// Example: Clipboard API with detection
async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) {
    showMessage('Clipboard API not supported', { type: 'warning' });
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    showMessage('Clipboard access denied', { type: 'warning' });
    return false;
  }
}
```

**Common APIs to check:**

- `navigator.clipboard` - Clipboard access
- `navigator.share` - Web Share API
- `window.showOpenFilePicker` - File System Access API
- `navigator.bluetooth` - Web Bluetooth
- `navigator.serial` - Web Serial
- `navigator.usb` - Web USB

## Touch & Responsive Design

Tools must work on touch devices (phones, tablets) with varying screen sizes.

### Pointer Events

Use pointer events instead of mouse/touch listeners for cross-device compatibility:

```typescript
// Good - works on all input types
element.addEventListener('pointerdown', handlePointerDown);

// Avoid - mouse only
element.addEventListener('mousedown', handleMouseDown);

// Avoid - touch only
element.addEventListener('touchstart', handleTouchStart);
```

### Responsive Layout

- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) for adaptive layouts
- Use DaisyUI components which are responsive by default
- Design for mobile first, then enhance for larger screens
- Use flexible layouts (`flex`, `grid`) that adapt to available space

### Touch-Friendly Considerations

- Ensure interactive elements are easily tappable
- Use appropriate spacing between interactive elements
- Consider landscape and portrait orientations
- Use CSS `touch-action` when implementing custom gestures

## Error Handling

- **No empty catch blocks** - never swallow exceptions silently
- **Log meaningful messages** with context: `console.error('[MyTool] Failed to process:', error)`
- **Show user-friendly messages** in the UI (toast, alert, inline text)
- **Validate user input** before processing
- **Handle empty states** gracefully (show "nothing entered yet" message)
- **Avoid throwing** on malformed input - show a message instead

## Architecture & Design

- **SOLID Principles**: Follow Single Responsibility Principle strictly
- **Immutability**: Prefer `const` and immutable data structures
- **Early Return**: Avoid deep nesting; use guard clauses
- **DRY**: Check for existing utilities before writing helper functions. If you see an opportunity to refactor existing code to reduce duplication while implementing a new feature, suggest it.
- **Composition over Inheritance**: Share behavior through composition

## Styling (Tailwind CSS + DaisyUI)

- Use **utility classes** for styling
- Leverage **DaisyUI components** (`btn`, `card`, `input`, `form-control`)
- Use **DaisyUI tokens** for theme-aware styling:
  - `bg-base-100` instead of `bg-white` / `dark:bg-slate-800`
  - `text-base-content` instead of `text-gray-900`
  - `border-base-300` instead of `border-gray-200`
- Use `dark:` sparingly - prefer DaisyUI themes
- Keep **custom CSS** in `src/css/styles.css` minimal

### DaisyUI CSS Variables

**IMPORTANT:** Do NOT use short TailwindCSS/DaisyUI variables like `--p`, `--pc`, `--b1`, `--b2`, `--b3`, `--bc`, etc. These are internal implementation details and may not work correctly in custom CSS.

Use the full CSS variable names instead:

| Variable                    | Description             |
| --------------------------- | ----------------------- |
| `--color-primary`           | Primary brand color     |
| `--color-primary-content`   | Foreground on primary   |
| `--color-secondary`         | Secondary brand color   |
| `--color-secondary-content` | Foreground on secondary |
| `--color-accent`            | Accent brand color      |
| `--color-accent-content`    | Foreground on accent    |
| `--color-neutral`           | Neutral dark color      |
| `--color-neutral-content`   | Foreground on neutral   |
| `--color-base-100`          | Base background         |
| `--color-base-200`          | Base darker             |
| `--color-base-300`          | Base even darker        |
| `--color-base-content`      | Foreground on base      |

**For opacity**, use CSS `color-mix()`:

```css
/* Correct */
background-color: color-mix(in srgb, var(--color-primary) 20%, transparent);

/* Incorrect - DO NOT USE short vars */
background-color: oklch(var(--p) / 0.2);
```

**Never use `@apply`** in custom `<style>` blocks - use plain CSS with DaisyUI variables.

## File Dropzone Pattern

All tools with file upload functionality should use this standardized dropzone pattern:

```html
<div id="dropzone" class="... min-h-40 group hover:bg-base-300">
  <div class="... transition-transform group-hover:scale-105">
    <!-- icon + text + paste button -->
  </div>
  <input type="file" class="hidden" ... />
</div>
```

### Standard Dropzone Classes

- **Container**: `flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-base-200 dark:bg-gray-800 dark:border-gray-600 transition-colors p-3 min-h-40 group hover:bg-base-300`
- **Inner wrapper**: `flex flex-col items-center gap-2 text-center transition-transform group-hover:scale-105`

### Optional: Paste Button

For image tools that support pasting from clipboard, add inside the inner wrapper:

```html
<button id="paste-btn" class="btn btn-outline flex-1 sm:flex-none">
  <i data-lucide="clipboard" class="w-4 h-4 mr-2"></i>
  or click here to Paste from clipboard
</button>
```

### Key Points

- Always use `min-h-40` for consistent height across all tools
- Include `group` on the container and `group-hover:scale-105` on the inner wrapper for the hover scale animation
- Include `hover:bg-base-300` on the container for the background color change on hover
- Keep paste buttons only where applicable (e.g., image processing tools)

## General Guidelines

- **Dependencies:** Avoid introducing new dependencies. For small helpers/functions, implement them locally or ask before adding packages.

- Ensure all code is compatible with modern browsers
- Use helper/util functions from `src/js/` - contains common global functions for file handling, UI, theming, etc. If multiple tools need them, add to the shared folder
- Reference `docs/index.md` for complete tool creation documentation

## Additional Reference

**AGENTS.md** covers: quick rules, patterns, code style, shared utilities.

**docs/index.md** covers: detailed tutorials, step-by-step guides, configuration options.

For detailed documentation on these topics, see `docs/index.md`:

- **Share Target (PWA)**: Receive files from other apps
- **Tool-specific dependencies**: pnpm-workspace pattern (per-tool package.json)
- **Section configuration**: Custom section titles in site.config.ts
- **Template placeholders**: `{{ config.title }}` syntax (resolved from siteContext)
- **Custom icons**: Register additional Lucide icons via main.ts
- **SiteContext extension**: Add custom config fields via declaration merging
- **Theme switching**: Dark/light mode via daisyUI
- **main.ts hook**: Project-level startup logic

## Shared Utilities

Available in `src/js/`. This is not a complete list — if you find a utility is needed by multiple tools, add it to the shared folder.

| Module            | Functions                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `file-utils.ts`   | `setupFileDropzone(el, onFiles)`, `downloadFile(blob, name)`, `downloadAsZip(files, name)`, `retrieveImageBlobFromClipboard()`         |
| `theme.ts`        | `isDarkMode()`, `setTheme('dark' or 'light')`, `setupThemeToggle(btn)`                                                                 |
| `utils.ts`        | `fuzzyScore`, `replacePlaceholders`, `debounce`, `throttleTrailing`, `acquireWakeLock`, `withTimeout`, `isImageFile`, `hashUint8Array` |
| `mime-types.ts`   | `detectMimeType(filename)`                                                                                                             |
| `share-target.ts` | `SharedFilesPayload`, `loadSharedFiles()`, `findToolForMimeTypes()`                                                                    |
| `favorites.ts`    | `getFavorites()`, `toggleFavorite(toolId)`, `isFavorite(toolId)`                                                                       |
| `tool-config.ts`  | `parseToolConfig(json)`, `buildTool(config)`                                                                                           |

Import with: `import { functionName } from '../../js/filename';`
