# Code Assist - Core Rules

This file is the fast, high-priority rule set for AI coding agents.

For extended examples and walkthroughs, see:

- `AGENTS.details.md`
- `docs/index.md`

## Priority Model

- `ALWAYS`: Hard constraints. Do not violate.
- `PREFER`: Default behavior. Use unless there is a clear reason not to.
- `WHEN RELEVANT`: Apply only when the task needs it.

## ALWAYS

- **Caveman terse style** (caveman.md): REQUIRED. Drop filler, articles, pleasantries.
- Use `pnpm` only. Never use `npm`.
- Check existing implementations before adding new code:
  - similar tools in `src/tools/*`
  - shared utilities in `src/js/*`
  - docs in `docs/index.md`
- Keep tool state inside `init()`.
- Do not use module-level tool state.
- Export tools as `export default function init(): void | (() => void)`.
- Return cleanup from `init()` when adding listeners, timers, observers, or side effects.
- Prefer listeners on tool-local containers. If global listeners are necessary, always remove them in cleanup.
- Run `pnpm tsc` for validation unless production behavior must be verified.
- Do not run global formatting by default. Format touched files only.
- Do not manually call `createIcons()` or import `lucide` for icon rendering.
- Keep custom CSS minimal in `src/css/style.css`.
- Do not add dependencies unless necessary. Ask first if unclear.
- No Node.js-only APIs in tool code (`fs`, `path`, `os`, `child_process`, Node `crypto`, etc.).

## PREFER

- Keep answers short and concise.
- Use English for code, comments, and docs.
- Use `type` over `interface`.
- Use explicit return types for exported functions.
- Avoid `any`; use `unknown` when needed.
- Use relative imports and `import type` for type-only imports.
- Use early returns and avoid deep nesting.
- Reuse shared utilities instead of duplicating helpers.
- Log errors with context, for example: `console.error('[ToolName] message', error)`.
- Show user-facing feedback for failures and empty states.

## WHEN RELEVANT

- If creating a tool, include:
  - `src/tools/<tool-id>/config.json`
  - `src/tools/<tool-id>/template.html`
  - `src/tools/<tool-id>/index.ts` (only if JS is needed)
- Use DaisyUI/Tailwind tokens (`bg-base-100`, `text-base-content`, `border-base-300`) before custom dark-mode classes.
- Keep shared dropzone classes aligned with existing tool templates unless intentionally refactoring the whole pattern.
- Use pointer events for input handling when interaction is involved.
- Check browser API availability (`navigator.clipboard`, `navigator.share`, etc.) before use.
- For WASM usage, load lazily and clean up resources.

## Agent Workflow Checklist

Before editing:

- Confirm similar code does not already exist.
- Confirm needed utilities are not already in `src/js/*`.
- Confirm new dependency is truly required.

While editing:

- Keep changes scoped to requested areas.
- Keep state local to `init()`.
- Keep listeners local to tool container where possible.
- Add cleanup for side effects.

After editing:

- Run `pnpm tsc`.
- Optionally run file-scoped formatting on touched files.
- Report what changed and why.

## Commands

```bash
pnpm tsc
pnpm exec prettier --write <touched-file-1> <touched-file-2>
```

Use full build only when needed:

```bash
pnpm build
pnpm preview
```

## Tool Contract (Reference)

```ts
export default function init(): void | (() => void) {
  // setup

  return () => {
    // cleanup
  };
}
```

## Project Constraints

- Browser-only toolkit (no backend).
- Offline-first PWA. Do not fetch runtime assets from CDNs.
- Tools are routed by hash (for example `/#tool-id`).
- Lucide icons are rendered by observer using `data-lucide`.

## Key Concepts Not In Core Rules

- App bootstrap and tool discovery are orchestrated in `src/script.ts`.
- `src/main.ts` is an optional one-time startup hook (project-level setup).
- Tool-specific dependencies are supported via `pnpm-workspace.yaml` and per-tool `package.json`.
- Share-target tools can receive `SharedFilesPayload` in `init(payload?)`.
- Template placeholders use `{{ key.path }}` and are resolved from site context. Special syntax exists to include separated files: `{{ include "file.html" }}`, also for CSS.
- Site config overrides use `src/config/site.config.ts` (copied from template).
- Advanced WASM usage patterns live in `docs/index.md`.

## Where To Look

- Core rules: `AGENTS.md`
- Extended guidance and examples: `AGENTS.details.md`
- Skill routing helpers: `.agents/skills/*/SKILL.md` (for task-specific entry points, not source-of-truth rules)
- Full project documentation: `docs/index.md`
- Shared utilities: `src/js/*`
- Existing tool patterns: `src/tools/*`
