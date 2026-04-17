# Sketch Board Architecture

The Sketch Board is an interactive canvas drawing tool built with an object-oriented, scalable rendering pipeline.

It handles drawing vector-like primitives onto an infinite HTML5 canvas while keeping performance high by utilizing offscreen layers and managing user interactions centrally.

## Core Modules

- **`index.ts`**: The main entry point. It orchestrates the wiring between UI events, DOM interactions, and the specialized core modules. It instantiates the history, renderer, viewport, tools, and the element editor.
- **`dom.ts`**: Extracts and validates all necessary DOM elements once, returning a fully typed `SketchDom` wrapper object. This prevents redundant DOM queries throughout the lifecycle of the app.
- **`shapes/` (Tool Registry)**: Contains classes for each individual drawing tool (`freehand-tool.ts`, `rect-tool.ts`, `text-tool.ts`, etc.) conforming to a standard `BaseTool`/`DrawTool` interface. These handle the distinct logic for translating pointer points into shape elements.
- **`renderer.ts`**: The visual engine. To boost performance, it renders committed elements onto an offscreen canvas (`baseLayerCanvas`). The live canvas then quickly composites this base layer alongside "active" previews (like a currently dragged box or selection bounding handles) without redrawing all elements.
- **`input-handler.ts`**: Normalizes raw browser pointer events against device pixel ratios and the active `viewport`. It routes events sequentially—either to panning controls, the `element-editor`, or the active shape tool.
- **`viewport.ts`**: Manages the "infinite-canvas" experience. It tracks scaling (zoom) and translation (pan) state, which the renderer applies to its context dynamically.
- **`element-editor.ts`**: Responsible for the "select" tool mode. Calculates bounding boxes (`AABB`), handles transformations (resizing/moving), and delegates the mutation of existing element states.
- **`history.ts`**: Implements basic Undo/Redo capability by freezing and pushing array snapshots of all elements whenever continuous interactions finish.
- **`drawing.ts`**: Contains pure stateless render logic (`drawElement`) and geometrical utilities calculating precise bounds and thumbnails.
- **`gallery.ts` & `store.ts`**: Connects the canvas to local memory. Evaluates `IndexedDB` save states and manages exporting to images via `@js/canvas-utils.ts`.
- **`toolbar.ts`**: Manages the visible toolset. Syncs options relevant to the currently selected mode.

## Data Workflow

1.  **Input Registration**: A user clicks and drags. The raw DOM event flows into `input-handler.ts`.
2.  **Transformation**: The coordinates are mapped through `viewport.ts` transformations.
3.  **Action Dispatch**:
    - If in drawing mode, the event updates the active shape tool.
    - If in select mode, the event triggers checks in `element-editor.ts` to see if handles/bounds are intersected.
4.  **Mutations**: The tool edits intermediate state. When pointer finishes (`up`), the new element is pushed to the central `elements` array, and a snapshot goes to `history.ts`.
5.  **Render Request**: `renderer.ts` receives a dirty flag. During the next animation frame, it updates the cached `baseLayerCanvas` and outputs the final composited image to the visible DOM canvas.
