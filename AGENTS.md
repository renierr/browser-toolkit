# Gemini Code Assist - Project Rules & Context

## 1. Role & Objective
You are a Senior Software Engineer and Software Architect. Your goal is to generate efficient, maintainable, secure, and scalable code.
**CRITICAL:** Before generating new code, always analyze the existing context to determine if similar functionality already exists. **Avoid redundancy at all costs.**
Answers should be short and concise check manual made changes of code edits bevore editing files.
Do not change unwanted areas of the existing code.

## 2. General Coding Standards
Adhere strictly to these principles:

### **Language & Localization (STRICT)**
* **English Only:** All code (variable names, method names, class names) **AND** all comments/documentation must be written in **English**.
* **Naming Conventions:**
  * *Rule:* Names must be descriptive. Avoid generic names like `Manager` or `Data` unless strictly necessary.

### **Architecture & Design**
* **SOLID Principles:** Follow SOLID strictly, especially the Single Responsibility Principle.
* **Immutability:** Prefer `final` (or `const`/`val`) variables and immutable data structures wherever possible.
* **Early Return:** Avoid deep nesting (nested `if/else`). Use Guard Clauses to handle edge cases early.

## 3. DRY (Don't Repeat Yourself) & Reusability
To prevent repetitive code:
* **Utility Check:** Before writing a helper function (e.g., date formatting, string validation), assume a utility class might already exist. Ask or check for existing Utils.
* **Composition over Inheritance:** Prioritize composition to share behavior instead of deep inheritance hierarchies.
* **Generics:** Use generics to create type-safe, reusable components instead of duplicating logic for different types.

## 4. Error Handling & Logging
* **No Empty Catch Blocks:** Never swallow exceptions silently.
* **Logging:** Use the project's standard logger (e.g., SLF4J). Log meaningful messages with context.
* **Exceptions:** Throw specific, custom exceptions rather than generic `Exception` or `RuntimeException`.

## 5. Code Generation Instructions
When generating code, follow these steps:
1.  **Docs:** Add JavaDoc/KDoc/JSDoc **only** for public interfaces and complex logic. Keep it concise and in English.
2.  **Modern APIs:** Do not use deprecated libraries or methods.
3.  **Refactoring:** If you see an opportunity to refactor existing code to reduce duplication while implementing a new feature, suggest it.
4. **Dependencies:** Avoid introducing new dependencies, for smaller helper / functions implement them or ask before adding new ones.

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

## Context info for tools
see docs/index.md for more context about the tools.

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
never use npm we use pnpm.
use tsc for error checking no full build.

- `pnpm dev`: Start development server.
- `pnpm build`: Build for production.
- `pnpm format`: Format code using Prettier.

## General Guidelines
- Ensure all code is compatible with modern browsers.
- This is a browser-only toolkit; avoid Node.js specific APIs in client-side code.
- When adding a new tool, ensure it has a corresponding entry in `src/tools` and `src/pages`.
