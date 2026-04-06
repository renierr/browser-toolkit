# Tools Inventory

This file lists all registered tools from `src/tools/*/config.json`.

- Total tools: **49**
- Sections: `devices`, `general`, `images`, `media`, `pdf`, `utilities`
- Source of truth for each entry: `src/tools/<tool-id>/config.json`

## Devices (3)

### Heart Rate Monitor (`heart-rate-monitor`)
- Description: Connect to a Bluetooth Heart Rate monitor to see and record your heart rate in real-time.
- Metadata: Order `1`, icon `heart`, share target `none`.
- Source: `src/tools/heart-rate-monitor/config.json`

### Treadmill Control (`treadmill-control`)
- Description: Connect to an FTMS-compatible treadmill to monitor your workout and control speed and incline.
- Metadata: Order `2`, icon `activity`, share target `none`.
- Source: `src/tools/treadmill-control/config.json`

### BLE Scanner (`ble-scanner`)
- Description: Scan for nearby Bluetooth Low Energy devices and identify them using an extensive device database.
- Metadata: Order `10`, icon `bluetooth`, share target `none`.
- Source: `src/tools/ble-scanner/config.json`

## General (11)

### Markdown Viewer (`markdown-viewer`)
- Description: Render and view Markdown files with GFM support, task lists, footnotes, and more.
- Metadata: Order `not set`, icon `file-text`, share target `text/markdown`, `text/x-markdown`, `text/plain`, `application/octet-stream`.
- Source: `src/tools/markdown-viewer/config.json`

### QR Scanner (`qr-scanner`)
- Description: Scan QR codes using your camera or an image file. Works offline.
- Metadata: Order `1`, icon `qr-code`, share target `none`.
- Source: `src/tools/qr-scanner/config.json`

### QR Generator (`qr-generator`)
- Description: Generate QR codes from text or URLs. Customize size and colors.
- Metadata: Order `2`, icon `qr-code`, share target `none`.
- Source: `src/tools/qr-generator/config.json`

### Notes (`notes`)
- Description: Offline-first note taking tool with search and date ordering.
- Metadata: Order `3`, icon `notebook-pen`, share target `none`.
- Source: `src/tools/notes/config.json`

### Signature Creator (`signature-creator`)
- Description: Draw and save signatures as transparent images or SVG paths for use in PDF annotations.
- Metadata: Order `4`, icon `pen-tool`, share target `none`.
- Source: `src/tools/signature-creator/config.json`

### Morse Code (`morse-code`)
- Description: Convert text to Morse code and play it as sound or screen flash.
- Metadata: Order `5`, icon `radio`, share target `audio/*`.
- Source: `src/tools/morse-code/config.json`

### Braille & Sign Language (`braille-sign-language`)
- Description: Visual reference tool translating typed words into Braille patterns and ASL alphabet illustrations.
- Metadata: Order `10`, icon `hand`, share target `none`.
- Source: `src/tools/braille-sign-language/config.json`

### GPS Location Store (`gps-location-store`)
- Description: Store and track your GPS locations offline with history and distance calculation.
- Metadata: Order `10`, icon `map-pin`, share target `none`.
- Source: `src/tools/gps-location-store/config.json`

### Grocery List (`grocery-list`)
- Description: Manage your grocery items with amounts, reuse from history, and check off items.
- Metadata: Order `10`, icon `shopping-cart`, share target `none`.
- Source: `src/tools/grocery-list/config.json`

### Timer (`timer`)
- Description: Simple countdown timer with presets and notifications.
- Metadata: Order `10`, icon `timer`, share target `none`.
- Source: `src/tools/timer/config.json`

### Battery Info (`battery-info`)
- Description: View battery status and detailed information for this device.
- Metadata: Order `11`, icon `battery`, share target `none`.
- Source: `src/tools/battery-info/config.json`

## Images (8)

### Image Convert / Redact (`image-redactor`)
- Description: Convert, crop, redact, and pixelate images.
- Metadata: Order `not set`, icon `crop`, share target `image/*`.
- Source: `src/tools/image-redactor/config.json`

### Image Vectorizer (`image-vectorizer`)
- Description: Convert raster images (PNG, JPG) into scalable SVG vectors.
- Metadata: Order `not set`, icon `image`, share target `none`.
- Source: `src/tools/image-vectorizer/config.json`

### AI Background Remover (`background-remover`)
- Description: Remove backgrounds from images locally using AI.
- Metadata: Order `5`, icon `eraser`, share target `image/*`.
- Source: `src/tools/background-remover/config.json`

### AI Image Magic (`image-manipulation`)
- Description: Apply AI magic like upscaling or line drawing to your images.
- Metadata: Order `5`, icon `sparkles`, share target `image/*`.
- Source: `src/tools/image-manipulation/config.json`

### Document Scanner (`document-scanner`)
- Description: Scan documents, correct perspective, and apply clean filters.
- Metadata: Order `10`, icon `scan`, share target `image/*`.
- Source: `src/tools/document-scanner/config.json`

### EXIF Cleaner & Viewer (`exif-cleaner`)
- Description: View and strip EXIF metadata from images.
- Metadata: Order `10`, icon `image`, share target `image/*`.
- Source: `src/tools/exif-cleaner/config.json`

### Images to PDF (`images-to-pdf`)
- Description: Convert multiple images into a single PDF document.
- Metadata: Order `10`, icon `file-image`, share target `image/*`.
- Source: `src/tools/images-to-pdf/config.json`

### OCR Text Extractor (`ocr-extractor`)
- Description: Extract text from images using Tesseract.
- Metadata: Order `10`, icon `scan-text`, share target `image/*`.
- Source: `src/tools/ocr-extractor/config.json`

## Media (5)

### Video Transcoder (`video-transcoder`)
- Description: Convert and compress video files using FFmpeg.wasm.
- Metadata: Order `not set`, icon `video`, share target `video/*`.
- Source: `src/tools/video-transcoder/config.json`

### Chiptune (`chiptune`)
- Description: Play MOD, XM, and IT tracker files with visual waveform and spectrum analysis.
- Metadata: Order `1`, icon `headphones`, share target `audio/x-mod`, `audio/xm`, `audio/it`, `audio/x-s3m`, `audio/*`.
- Source: `src/tools/chiptune/config.json`

### Focus Noise & Breathing (`noise-generator`)
- Description: Generate continuous background noise and follow guided breathing for focus or relaxation.
- Metadata: Order `1`, icon `waves`, share target `none`.
- Source: `src/tools/noise-generator/config.json`

### Chiptune Tracker (`chiptune-tracker`)
- Description: MOD tracker editor - load, edit, and export Amiga module files with sample-accurate playback.
- Metadata: Order `2`, icon `music`, share target `audio/x-mod`, `audio/mod`, `application/octet-stream`.
- Source: `src/tools/chiptune-tracker/config.json`

### Audio Recorder (`audio-recorder`)
- Description: Record audio, visualize waveforms, and save as WebM.
- Metadata: Order `6`, icon `mic`, share target `none`.
- Source: `src/tools/audio-recorder/config.json`

## PDF (7)

### PDF Viewer / Editor (`pdf-viewer`)
- Description: Use Empedpdf to view and edit PDF files.
- Metadata: Order `1`, icon `file-pen`, share target `application/pdf`.
- Source: `src/tools/pdf-viewer/config.json`

### HTML to PDF (`html-to-pdf`)
- Description: Create PDF from HTML.
- Metadata: Order `2`, icon `file-pen-line`, share target `none`.
- Source: `src/tools/html-to-pdf/config.json`

### Flatten PDF as Image (`pdf-to-image`)
- Description: Take a PDF and flatten it to a series of images.
- Metadata: Order `3`, icon `scan-text`, share target `application/pdf`.
- Source: `src/tools/pdf-to-image/config.json`

### Extract Images (`pdf-extract-images`)
- Description: Extract images embedded inside a PDF.
- Metadata: Order `4`, icon `image-down`, share target `application/pdf`.
- Source: `src/tools/pdf-extract-images/config.json`

### PDF Organizer (`pdf-organizer`)
- Description: Merge, reorder, remove, or duplicate pages in your PDF documents.
- Metadata: Order `5`, icon `layout-grid`, share target `application/pdf`.
- Source: `src/tools/pdf-organizer/config.json`

### PDF Un-/locker (`pdf-remove-restrictions`)
- Description: Modify printing, copying, and editing restrictions from PDF files.
- Metadata: Order `6`, icon `unlock`, share target `application/pdf`.
- Source: `src/tools/pdf-remove-restrictions/config.json`

### PDF Metadata Viewer (`pdf-metadata`)
- Description: View and extract metadata from PDF files (title, author, subject, keywords, etc.).
- Metadata: Order `100`, icon `info`, share target `application/pdf`.
- Source: `src/tools/pdf-metadata/config.json`

## Utilities (15)

### Base64 Encoder/Decoder (`base64`)
- Description: Encode and decode text to and from Base64 format (supports UTF-8).
- Metadata: Order `not set`, icon `binary`, share target `none`.
- Source: `src/tools/base64/config.json`

### File Converter (`file-converter`)
- Description: Convert documents between common formats.
- Metadata: Order `not set`, icon `file-text`, share target `text/*`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/xhtml+xml`, `text/markdown`, `text/html`, `application/epub+zip`.
- Source: `src/tools/file-converter/config.json`

### KeePass Viewer (`keepass-viewer`)
- Description: View KeePass (.kdbx) password databases locally. Browse groups, entries, and copy credentials securely in your browser.
- Metadata: Order `not set`, icon `lock`, share target `application/x-keepass`, `.kdbx`.
- Source: `src/tools/keepass-viewer/config.json`

### Regex Visualizer (`regex-visualizer`)
- Description: Visualize regular expressions as railroad diagrams to understand their matching logic.
- Metadata: Order `not set`, icon `regex`, share target `none`.
- Source: `src/tools/regex-visualizer/config.json`

### SQLite Explorer (`sqlite-explorer`)
- Description: Explore SQLite databases locally in your browser. View tables, schemas, and execute custom SQL queries.
- Metadata: Order `not set`, icon `database`, share target `application/vnd.sqlite3`, `application/x-sqlite3`, `.sqlite`, `.sqlite3`, `.db`.
- Source: `src/tools/sqlite-explorer/config.json`

### Calculator (`calculator`)
- Description: Powerful scientific calculator with session history and mobile-first design.
- Metadata: Order `5`, icon `calculator`, share target `none`.
- Source: `src/tools/calculator/config.json`

### Code Formatter (`code-formatter`)
- Description: Format, minify, and highlight code and data formats.
- Metadata: Order `10`, icon `code`, share target `text/*`, `application/json`, `application/xml`, `application/javascript`, `application/typescript`, `application/yaml`, `application/toml`, `application/sql`, `application/ld+json`, `application/rtf`, `application/xhtml+xml`, `application/manifest+json`, `application/xslt+xml`, `application/atom+xml`, `application/rss+xml`, `application/x-httpd-php`, `application/x-sh`, `application/x-csh`, `application/x-latex`, `application/x-tcl`, `application/x-perl`, `application/x-python`.
- Source: `src/tools/code-formatter/config.json`

### Color Checker (`color-contrast`)
- Description: Check color contrast for WCAG accessibility, analyze image colors, and pick colors.
- Metadata: Order `10`, icon `palette`, share target `none`.
- Source: `src/tools/color-contrast/config.json`

### Hex Editor (`hex-editor`)
- Description: View and edit files in hex and ASCII formats.
- Metadata: Order `10`, icon `binary`, share target `*/*`.
- Source: `src/tools/hex-editor/config.json`

### Periodic Table (`periodic-table`)
- Description: Interactive periodic table with electron shells, isotopes, and atomic structure visualization.
- Metadata: Order `10`, icon `atom`, share target `none`.
- Source: `src/tools/periodic-table/config.json`

### Survival Guide (`survival-guide`)
- Description: Offline survival guides for wilderness, emergency, and disaster situations. Fire starting, water purification, first aid, shelter, and more.
- Metadata: Order `10`, icon `book-open`, share target `none`.
- Source: `src/tools/survival-guide/config.json`

### Archive Viewer (`archive-viewer`)
- Description: View and extract files from ZIP, TAR, TAR.GZ and 7Z archives without extracting the entire archive.
- Metadata: Order `11`, icon `archive`, share target `application/zip`, `application/x-tar`, `application/gzip`, `application/x-7z-compressed`, `application/x-xz`.
- Source: `src/tools/archive-viewer/config.json`

### SVG Optimizer (`svg-optimizer`)
- Description: Optimize and minify SVG files. Upload or paste SVG code to reduce file size.
- Metadata: Order `11`, icon `image`, share target `image/svg+xml`.
- Source: `src/tools/svg-optimizer/config.json`

### Share Debug (`share-debug`)
- Description: Debug tool to inspect shared files and their MIME types.
- Metadata: Order `100`, icon `bug`, share target `*/*`.
- Source: `src/tools/share-debug/config.json`

### WebRTC Drop (P2P) (`webrtc-drop`)
- Description: Send large files securely peer-to-peer using WebRTC. Finds peers on your local network automatically.
- Metadata: Order `100`, icon `share-2`, share target `none`.
- Source: `src/tools/webrtc-drop/config.json`

## Notes

- `Order` shows the current value from each `config.json`; `not set` means no explicit order is set.
- `Share target` lists accepted MIME types/extensions from `shareTarget.accept`.
- Update this file when tools are added, removed, or renamed.
