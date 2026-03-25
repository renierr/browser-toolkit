# Code Assist - Project Rules & Context

## Role & Objective

You are a Senior Software Engineer. Your goal is to generate efficient, maintainable, secure, and scalable code.
**CRITICAL:** Before generating new code, always analyze the existing context to determine if similar functionality already exists. **Avoid redundancy at all costs.**
Answers should be short and concise. Check manually made changes of code edits before editing files.
Do not change unwanted areas of the existing code.

## Project Overview

This is a **Browser Toolkit** - a collection of browser-only tools built with TypeScript and Vite.
It uses Tailwind CSS + DaisyUI for styling. There is no test framework - do not write tests.

## Commands

**Important:**

- Use **pnpm** only - never use npm
- Do NOT start the dev server (it's likely already running). Use `pnpm tsc` for type checking instead.

```bash
# Development
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
```

## Creating a New Tool

**Quick Summary (4 steps):**

1. **Create folder**: `src/tools/my-tool/`
2. **Add `config.json`**:

   ```json
   {
     "name": "My Tool",
     "description": "Does something useful",
     "draft": false,
     "icon": "crop"
   }
   ```

   - Any Lucide icon ID can be used (e.g., `"icon": "crop"`) - all Lucide icons are available automatically
   - Optional: `order`, `sectionId`, `shareTarget`, etc. See `@docs/index.md` for full reference

3. **Add `template.html`**: Use semantic HTML + DaisyUI components + Tailwind utilities
4. **Add `index.ts`** (optional): Export `init()` function with cleanup support

**Critical: Cleanup Pattern**

If your tool attaches global listeners (document/window), timers, or observers, return a cleanup function:

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

**Reference:** See `@docs/index.md` for complete documentation on:

- Tool-specific dependencies (pnpm-workspace)
- Share targets (PWA file receiving)
- Ordering & section grouping
- Template placeholders
- Dark/Light mode with DaisyUI

## Code Style Guidelines

### Language

- **English Only:** All code (variable names, method names, class names) AND all comments/documentation must be written in **English**.

### TypeScript

- **Use modern, non-deprecated APIs.** Avoid deprecated libraries or methods.

- **Strict mode enabled** (`strict: true` in tsconfig)
- **Prefer `interface`** over `type` for object definitions
- **Use explicit return types** for exported functions
- **Avoid `any`**; use `unknown` if necessary
- **Use `erasableSyntaxOnly`**: Use `type` instead of `interface` where possible, prefer `readonly` modifiers

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

- Use `fetch` instead of `fs.readFile`
- Use `URL` and `URLSearchParams` for URL manipulation
- Use `IndexedDB` for persistent storage
- Use Web APIs (`Blob`, `FileReader`, etc.)

### Module-Level Variables

**Do not create module-level variables** - they persist across tool navigation and cause bugs.
If needed, always clean them up. The cleanup handling pattern exists for this reason.

### WASM Memory Management

If using WebAssembly, free and destroy variables and allocated memory when done.

### index.ts Orchestration

The `index.ts` in each tool is for orchestration and DOM/listener management.
Extract utility functions into separate files within the tool folder.

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

## General Guidelines

- **Dependencies:** Avoid introducing new dependencies. For small helpers/functions, implement them locally or ask before adding packages.

- Ensure all code is compatible with modern browsers
- Use helper/util functions from `src/js/` - contains common global functions for file handling, UI, theming, etc. If multiple tools need them, add to the shared folder
- When adding a new tool, ensure it has entries in `src/tools/` and `src/pages/`
- Reference `@docs/index.md` for complete tool creation documentation
