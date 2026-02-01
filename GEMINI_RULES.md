# Project Rules for Gemini Code Assist

## Project Overview
This project is a **Browser Toolkit**, a collection of browser-only tools.
It is a **TypeScript** project built with **Vite**.

## Tech Stack
- **Language**: TypeScript (Target ES2022, Module ESNext)
- **Build Tool**: Vite 7
- **Package Manager**: pnpm
- **Styling**: Tailwind CSS 4, DaisyUI 5
- **Formatting**: Prettier

## Project Structure
- `src/`: Source code
  - `tools/`: Implementation of individual tools
  - `pages/`: HTML pages for tools
  - `components/`: Shared HTML components (header, footer)
  - `js/`: Shared JavaScript utilities and types
  - `css/`: Global styles
- `public/`: Static assets
- `dist/`: Build output

## Coding Conventions

### TypeScript
- Use strict type checking (`strict: true` in tsconfig).
- Prefer `interface` over `type` for object definitions.
- Use explicit return types for exported functions.
- Avoid `any`; use `unknown` if necessary.

### Styling (Tailwind CSS & DaisyUI)
- Use utility classes for styling.
- Leverage DaisyUI components for UI elements.
- Keep custom CSS in `src/css` minimal.

### File Naming
- Use kebab-case for file names (e.g., `pdf-viewer.ts`).
- Component files should be descriptive.

### Build & Scripts
- `pnpm dev`: Start development server.
- `pnpm build`: Build for production.
- `pnpm format`: Format code using Prettier.

## General Guidelines
- Ensure all code is compatible with modern browsers (ES2022).
- This is a browser-only toolkit; avoid Node.js specific APIs in client-side code.
- When adding a new tool, ensure it has a corresponding entry in `src/tools` and `src/pages`.
