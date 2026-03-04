# Third-Party Licenses

This project uses the third-party dependencies listed below.  
Only **direct dependencies** (listed in a `package.json`) are shown — transitive dependencies inherit their own licenses.  
For full license texts, see the linked sources and the license files shipped with each package (typically under `node_modules/<package>/LICENSE*`).  
Where required by the license terms, the relevant copyright and permission notices must be included with redistributions.

---

## Root Dependencies

### Lucide
License: ISC  
Source: https://github.com/lucide-icons/lucide

### jsPDF
License: MIT  
Source: https://github.com/parallax/jsPDF

### JSZip
License: MIT (OR GPL-3.0-or-later)  
Source: https://github.com/Stuk/jszip

### MuPDF
License: AGPL-3.0-or-later  
Source: https://cgit.ghostscript.com/mupdf.git/  
Note: Compatible with this project's AGPL-3.0 license.

### SortableJS
License: MIT  
Source: https://github.com/SortableJS/Sortable

### ONNX Runtime Web
License: MIT  
Source: https://github.com/microsoft/onnxruntime

### @embedpdf/models, @embedpdf/plugin-annotation, @embedpdf/snippet
License: MIT  
Source: https://github.com/embedpdf/embed-pdf-viewer

---

## Dev Dependencies

### Vite
License: MIT  
Source: https://github.com/vitejs/vite

### Tailwind CSS
License: MIT  
Source: https://github.com/tailwindlabs/tailwindcss

### @tailwindcss/vite
License: MIT  
Source: https://github.com/tailwindlabs/tailwindcss

### daisyUI
License: MIT  
Source: https://github.com/saadeghi/daisyui

### TypeScript
License: Apache-2.0  
Source: https://github.com/microsoft/TypeScript

### Prettier
License: MIT  
Source: https://github.com/prettier/prettier

### vite-plugin-pwa
License: MIT  
Source: https://github.com/vite-pwa/vite-plugin-pwa

### vite-plugin-wasm
License: MIT  
Source: https://github.com/Menci/vite-plugin-wasm

### vite-plugin-top-level-await
License: MIT  
Source: https://github.com/Menci/vite-plugin-top-level-await

---

## Tool-Level Dependencies

### @ffmpeg/ffmpeg
License: MIT  
Source: https://github.com/ffmpegwasm/ffmpeg.wasm  
Used by: video-transcoder

### @ffmpeg/util
License: MIT  
Source: https://github.com/ffmpegwasm/ffmpeg.wasm  
Used by: video-transcoder

### @ffmpeg/core
License: GPL-2.0-or-later  
Source: https://github.com/ffmpegwasm/ffmpeg.wasm  
Used by: video-transcoder  
Note: Contains FFmpeg compiled to WebAssembly. GPL-2.0 is compatible with this project's AGPL-3.0 license.

### Regexper
License: MIT  
Source: https://github.com/web-build-hub/regexper  
Used by: regex-visualizer

### SVGO
License: MIT  
Source: https://github.com/svg/svgo  
Used by: svg-optimizer

### zxing-wasm
License: MIT  
Source: https://github.com/Sec-ant/zxing-wasm  
Used by: qr-scanner

### qrcode
License: MIT  
Source: https://github.com/soldair/node-qrcode  
Used by: qr-generator

### imagetracerjs
License: Unlicense (public domain)  
Source: https://github.com/jankovicsandras/imagetracerjs  
Used by: image-vectorizer

### Quill
License: BSD-3-Clause  
Source: https://github.com/slab/quill  
Used by: html-to-pdf

### overtype
License: MIT  
Source: https://github.com/panphora/overtype  
Used by: notes

### ExifReader
License: MPL-2.0  
Source: https://github.com/mattiasw/ExifReader  
Used by: exif-cleaner  
Note: MPL-2.0 is compatible with AGPL-3.0 (file-level copyleft).

### Shiki
License: MIT  
Source: https://github.com/shikijs/shiki  
Used by: code-formatter

### sql-formatter
License: MIT  
Source: https://github.com/sql-formatter-org/sql-formatter  
Used by: code-formatter

### Tesseract.js
License: Apache-2.0  
Source: https://github.com/naptha/tesseract.js  
Used by: ocr-extractor

### tesseract.js-core
License: Apache-2.0  
Source: https://github.com/naptha/tesseract.js-core  
Used by: ocr-extractor

---

## Model Files

### U²-Net(P) Model (u2netp-q.onnx)
License: Apache-2.0  
Source: https://github.com/xuebinqin/U-2-Net  
Location: `public/lib/models/u2netp-q.onnx`  
The quantized ONNX model file is derived from U²-Net Portable.  
See the [U²-Net repository](https://github.com/xuebinqin/U-2-Net) for the full Apache-2.0 license text.
