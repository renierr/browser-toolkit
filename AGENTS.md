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
- Use `bun` only. Never use `npm` or `pnpm`.
- Do not run `bun run build` unless user explicitly asks or final verification was requested.
- Do not `git add`, `git commit`, `git push`, or run any git write operation unless user explicitly says "commit" or "push". Prior consent does not carry forward — each write requires a fresh explicit command.
- Check existing implementations before adding new code:
  - similar tools in `src/tools/*`
  - shared utilities in `src/js/*`
  - docs in `docs/index.md`
- Use `fetchApi`, `fetchJson`, `fetchBlob`, or `uploadFile` (for streams/files) from `src/js/api.ts` for all backend communication. Never use direct `fetch()` for `/api/*` endpoints.
- Keep tool state inside `init()`.
- Do not use module-level tool state.
- Export tools as `export default function init(): void | (() => void)`.
- Return cleanup from `init()` when adding listeners, timers, observers, or side effects.
- Prefer listeners on tool-local containers. If global listeners are necessary, always remove them in cleanup.
- Run `bun x tsc` (and `bun x tsc -p backend/tsconfig.json` if backend was touched) for validation unless production behavior must be verified.
- Format touched files using Prettier. Do not run global formatting.
- Do not manually call `createIcons()` or import `lucide` for icon rendering.
- Keep custom CSS minimal in `src/css/style.css`.
- Do not add dependencies unless necessary. Ask first if unclear.
- No Node.js-only APIs in tool code (`fs`, `path`, `os`, `child_process`, Node `crypto`, etc.).
- Never mention AI agents, co-authorship, or AI generation in commit messages or code.

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
- For backend tools, set `"requiresBackend": true` in `config.json`; backend-only tools stay hidden when backend is unavailable.
- For backend tools, call `/api/*` via `fetchApi`, `fetchJson`, `fetchBlob`, or `uploadFile` from `src/js/api.ts`.

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

- Run `bun x tsc`.
- If backend was touched, run `bun x tsc -p backend/tsconfig.json`.
- Run file-scoped formatting on touched files.
- If creating a new tool, run `bun run generate:tool-description`.
- Report what changed and why.

```bash
bun x tsc
bun x tsc -p backend/tsconfig.json
bun x prettier --write <touched-file-1> <touched-file-2>
```

Use full build only when needed:

```bash
bun run build
bun run preview
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

- Browser-only toolkit by default, but supports an optional Bun backend.
- Offline-first PWA. Do not fetch runtime assets from CDNs.
- Tools are routed by hash (for example `/#tool-id`).
- Lucide icons are rendered by observer using `data-lucide`.
- Tools that require a backend server must set `"requiresBackend": true` in their `config.json`.

## Key Concepts Not In Core Rules

- App bootstrap and tool discovery are orchestrated in `src/script.ts`.
- Tool-specific dependencies are supported via root `package.json` workspaces (Bun) and per-tool `package.json`.
- Share-target tools can receive `SharedFilesPayload` in `init(payload?)`.
- Template placeholders use `{{ key.path }}` and are resolved from site context. Special syntax exists to include separated files: `<include src="file.html" />` and `<include src="file.css" type="style" />`. Global CSS aliases are supported too, for example `<include src="@css/markdown-content.css" type="style" />`.
- Site config is managed in `src/config/site.config.ts`.
- Advanced WASM usage patterns live in `docs/index.md`.

## Where To Look

- Core rules: `AGENTS.md`
- Extended guidance and examples: `AGENTS.details.md`
- Skill routing helpers: `.agents/skills/*/SKILL.md` (for task-specific entry points, not source-of-truth rules)
- Full project documentation: `docs/index.md`
- Shared utilities: `src/js/*`
- Existing tool patterns: `src/tools/*`
