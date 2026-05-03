# Tools Inventory

This file is generated from `src/tools/*/config.json`.
Run `bun run generate:tool-description` after changing tool metadata.

- Total tools: **57**
- Sections: `general`, `images`, `media`, `pdf`, `utilities`, `devices`
- Source of truth: `src/tools/<tool-id>/config.json`

## General (11)

### QR Scanner (`qr-scanner`)
- Description: Scan QR codes from the camera or image files.
- Metadata: Order `1`, icon `qr-code`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/qr-scanner/config.json`

### QR Generator (`qr-generator`)
- Description: Create QR codes from text or URLs with size and color customization.
- Metadata: Order `2`, icon `qr-code`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/qr-generator/config.json`

### Notes (`notes`)
- Description: Write notes with search and date-based organization.
- Metadata: Order `3`, icon `notebook-pen`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/notes/config.json`

### Signature Creator (`signature-creator`)
- Description: Draw signatures and export them as transparent images or SVG paths.
- Metadata: Order `4`, icon `pen-tool`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/signature-creator/config.json`

### Morse Code (`morse-code`)
- Description: Convert text to Morse code and play it as audio or visual signals.
- Metadata: Order `5`, icon `radio`, share target capable `yes`, share target accepts `audio/*`.
- Source: `src/tools/morse-code/config.json`

### Braille & Sign Language (`braille-sign-language`)
- Description: Translate typed text into Braille patterns and ASL alphabet visuals.
- Metadata: Order `10`, icon `hand`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/braille-sign-language/config.json`

### GPS Location Store (`gps-location-store`)
- Description: Save GPS locations, review history, and calculate traveled distance.
- Metadata: Order `10`, icon `map-pin`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/gps-location-store/config.json`

### Grocery List (`grocery-list`)
- Description: Create grocery lists with quantities, reusable items, and check-off tracking.
- Metadata: Order `10`, icon `shopping-cart`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/grocery-list/config.json`

### Timer (`timer`)
- Description: Run countdown timers with presets and notifications.
- Metadata: Order `10`, icon `timer`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/timer/config.json`

### Battery Info (`battery-info`)
- Description: Display battery level, charging state, and related device battery details.
- Metadata: Order `11`, icon `battery`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/battery-info/config.json`

### Markdown Viewer (`markdown-viewer`)
- Description: Render Markdown files with GitHub Flavored Markdown extensions.
- Metadata: Order `not set`, icon `file-text`, share target capable `yes`, share target accepts `text/markdown`, `text/x-markdown`, `text/plain`, `application/octet-stream`.
- Source: `src/tools/markdown-viewer/config.json`

## Images (9)

### AI Background Remover (`background-remover`)
- Description: Remove image backgrounds locally with an AI segmentation model.
- Metadata: Order `5`, icon `eraser`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/background-remover/config.json`

### AI Image Magic (`image-manipulation`)
- Description: Apply AI image effects such as upscaling and line-art conversion.
- Metadata: Order `5`, icon `sparkles`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/image-manipulation/config.json`

### Sketch Board (`sketch-board`)
- Description: Canvas whiteboard with freehand, shapes, export, and local version storage.
- Metadata: Order `7`, icon `pen-tool`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/sketch-board/config.json`

### Document Scanner (`document-scanner`)
- Description: Capture documents, correct perspective, and apply cleanup filters for readable scans.
- Metadata: Order `10`, icon `scan`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/document-scanner/config.json`

### EXIF Cleaner & Viewer (`exif-cleaner`)
- Description: Inspect image metadata and remove EXIF data from selected files.
- Metadata: Order `10`, icon `image`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/exif-cleaner/config.json`

### Images to PDF (`images-to-pdf`)
- Description: Combine multiple images into a single PDF document.
- Metadata: Order `10`, icon `file-image`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/images-to-pdf/config.json`

### OCR Text Extractor (`ocr-extractor`)
- Description: Extract text from images using OCR.
- Metadata: Order `10`, icon `scan-text`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/ocr-extractor/config.json`

### Image Convert / Redact (`image-redactor`)
- Description: Convert, crop, redact, and pixelate images.
- Metadata: Order `not set`, icon `crop`, share target capable `yes`, share target accepts `image/*`.
- Source: `src/tools/image-redactor/config.json`

### Image Vectorizer (`image-vectorizer`)
- Description: Convert raster images into scalable SVG vector graphics.
- Metadata: Order `not set`, icon `image`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/image-vectorizer/config.json`

## Media (6)

### Chiptune (`chiptune`)
- Description: Play MOD, XM, and IT tracker files with waveform and spectrum visualizations.
- Metadata: Order `1`, icon `headphones`, share target capable `yes`, share target accepts `audio/x-mod`, `audio/xm`, `audio/it`, `audio/x-s3m`, `audio/*`.
- Source: `src/tools/chiptune/config.json`

### Focus Noise & Breathing (`noise-generator`)
- Description: Generate ambient noise and guide paced breathing sessions for focus or relaxation.
- Metadata: Order `1`, icon `waves`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/noise-generator/config.json`

### Chiptune Tracker (`chiptune-tracker`)
- Description: Load, edit, and export Amiga MOD tracker files with sample-accurate playback.
- Metadata: Order `2`, icon `music`, share target capable `yes`, share target accepts `audio/x-mod`, `audio/mod`, `application/octet-stream`.
- Source: `src/tools/chiptune-tracker/config.json`

### Audio Recorder (`audio-recorder`)
- Description: Record audio, preview the waveform, and save the result as WebM.
- Metadata: Order `6`, icon `mic`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/audio-recorder/config.json`

### Text to Speech (`text-to-speech`)
- Description: Convert text to spoken audio using built-in browser voices.
- Metadata: Order `not set`, icon `volume-2`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/text-to-speech/config.json`

### Video Transcoder (`video-transcoder`)
- Description: Convert and compress video files with FFmpeg.wasm.
- Metadata: Order `not set`, icon `video`, share target capable `yes`, share target accepts `video/*`.
- Source: `src/tools/video-transcoder/config.json`

## PDF (7)

### PDF Viewer / Editor (`pdf-viewer`)
- Description: View and edit PDF files with EmbedPDF.
- Metadata: Order `1`, icon `file-pen`, share target capable `yes`, share target accepts `application/pdf`.
- Source: `src/tools/pdf-viewer/config.json`

### HTML to PDF (`html-to-pdf`)
- Description: Generate a PDF document from HTML content.
- Metadata: Order `2`, icon `file-pen-line`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/html-to-pdf/config.json`

### Flatten PDF as Image (`pdf-to-image`)
- Description: Flatten each PDF page into image output.
- Metadata: Order `3`, icon `scan-text`, share target capable `yes`, share target accepts `application/pdf`.
- Source: `src/tools/pdf-to-image/config.json`

### Extract images (`pdf-extract-images`)
- Description: Extract embedded images from PDF documents.
- Metadata: Order `4`, icon `image-down`, share target capable `yes`, share target accepts `application/pdf`.
- Source: `src/tools/pdf-extract-images/config.json`

### PDF Organizer (`pdf-organizer`)
- Description: Merge, reorder, remove, and duplicate pages in PDF documents.
- Metadata: Order `5`, icon `layout-grid`, share target capable `yes`, share target accepts `application/pdf`.
- Source: `src/tools/pdf-organizer/config.json`

### PDF Un-/locker (`pdf-remove-restrictions`)
- Description: Update PDF permission flags for printing, copying, and editing.
- Metadata: Order `6`, icon `unlock`, share target capable `yes`, share target accepts `application/pdf`.
- Source: `src/tools/pdf-remove-restrictions/config.json`

### PDF Metadata Viewer (`pdf-metadata`)
- Description: View and export PDF metadata such as title, author, and keywords.
- Metadata: Order `100`, icon `info`, share target capable `yes`, share target accepts `application/pdf`.
- Source: `src/tools/pdf-metadata/config.json`

## Utilities (19)

### Calculator (`calculator`)
- Description: Run scientific calculations with expression history and mobile-friendly controls.
- Metadata: Order `5`, icon `calculator`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/calculator/config.json`

### Unit Converter Pro (`unit-converter`)
- Description: Convert between 1000+ units across 20+ categories with a built-in scientific calculator.
- Metadata: Order `6`, icon `ruler`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/unit-converter/config.json`

### ASCII Art (`ascii-art`)
- Description: Convert text to ASCII art in multiple styles.
- Metadata: Order `10`, icon `type`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/ascii-art/config.json`

### Code Formatter (`code-formatter`)
- Description: Format, minify, and highlight source code and structured data.
- Metadata: Order `10`, icon `code`, share target capable `yes`, share target accepts `text/*`, `application/json`, `application/xml`, `application/javascript`, `application/typescript`, `application/yaml`, `application/toml`, `application/sql`, `application/ld+json`, `application/rtf`, `application/xhtml+xml`, `application/manifest+json`, `application/xslt+xml`, `application/atom+xml`, `application/rss+xml`, `application/x-httpd-php`, `application/x-sh`, `application/x-csh`, `application/x-latex`, `application/x-tcl`, `application/x-perl`, `application/x-python`.
- Source: `src/tools/code-formatter/config.json`

### Color Checker (`color-contrast`)
- Description: Check WCAG color contrast, sample image colors, and pick accessible color pairs.
- Metadata: Order `10`, icon `palette`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/color-contrast/config.json`

### Hex Editor (`hex-editor`)
- Description: Inspect and edit files in hexadecimal and ASCII views.
- Metadata: Order `10`, icon `binary`, share target capable `yes`, share target accepts `*/*`.
- Source: `src/tools/hex-editor/config.json`

### Periodic Table (`periodic-table`)
- Description: Explore an interactive periodic table with shells, isotopes, and atomic details.
- Metadata: Order `10`, icon `atom`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/periodic-table/config.json`

### Survival Guide (`survival-guide`)
- Description: Read survival guides for wilderness, emergency, and disaster scenarios.
- Metadata: Order `10`, icon `book-open`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/survival-guide/config.json`

### Archive Viewer (`archive-viewer`)
- Description: View archive contents and extract selected files from ZIP, TAR, TAR.GZ, and 7Z files.
- Metadata: Order `11`, icon `archive`, share target capable `yes`, share target accepts `application/zip`, `application/x-tar`, `application/gzip`, `application/x-7z-compressed`, `application/x-xz`.
- Source: `src/tools/archive-viewer/config.json`

### SVG Optimizer (`svg-optimizer`)
- Description: Optimize and minify SVG files from pasted code or uploaded files.
- Metadata: Order `11`, icon `image`, share target capable `yes`, share target accepts `image/svg+xml`.
- Source: `src/tools/svg-optimizer/config.json`

### Backend Info (`backend-info`)
- Description: Displays system information from the connected backend server
- Metadata: Order `100`, icon `server`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/backend-info/config.json`

### Share Debug (`share-debug`)
- Description: Inspect shared files and MIME types for share-target debugging.
- Metadata: Order `100`, icon `bug`, share target capable `yes`, share target accepts `*/*`.
- Source: `src/tools/share-debug/config.json`

### WebRTC Drop (P2P) (`webrtc-drop`)
- Description: Transfer large files peer-to-peer over WebRTC on the local network.
- Metadata: Order `100`, icon `share-2`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/webrtc-drop/config.json`

### Storage Inspector (`storage-inspector`)
- Description: Inspect browser storage data and clear cache, IndexedDB, localStorage, sessionStorage, and cookies.
- Metadata: Order `105`, icon `database`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/storage-inspector/config.json`

### Base64 Encoder/Decoder (`base64`)
- Description: Encode and decode text using Base64 with UTF-8 support.
- Metadata: Order `not set`, icon `binary`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/base64/config.json`

### File Converter (`file-converter`)
- Description: Convert documents between commonly used file formats.
- Metadata: Order `not set`, icon `file-text`, share target capable `yes`, share target accepts `text/*`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/xhtml+xml`, `text/markdown`, `text/html`, `application/epub+zip`.
- Source: `src/tools/file-converter/config.json`

### KeePass Viewer (`keepass-viewer`)
- Description: Open KeePass (.kdbx) databases to browse groups and copy credentials securely.
- Metadata: Order `not set`, icon `lock`, share target capable `yes`, share target accepts `application/x-keepass`, `.kdbx`.
- Source: `src/tools/keepass-viewer/config.json`

### Regex Visualizer (`regex-visualizer`)
- Description: Visualize regular expressions as railroad diagrams to explain matching behavior.
- Metadata: Order `not set`, icon `regex`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/regex-visualizer/config.json`

### SQLite Explorer (`sqlite-explorer`)
- Description: Open SQLite databases, browse schemas, and run SQL queries.
- Metadata: Order `not set`, icon `database`, share target capable `yes`, share target accepts `application/vnd.sqlite3`, `application/x-sqlite3`, `.sqlite`, `.sqlite3`, `.db`.
- Source: `src/tools/sqlite-explorer/config.json`

## Devices (5)

### Heart Rate Monitor (`heart-rate-monitor`)
- Description: Connect to a Bluetooth heart rate monitor and track live pulse measurements.
- Metadata: Order `1`, icon `heart`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/heart-rate-monitor/config.json`

### Treadmill Control (`treadmill-control`)
- Description: Connect to an FTMS treadmill to monitor workouts and control speed or incline.
- Metadata: Order `2`, icon `activity`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/treadmill-control/config.json`

### NFC Tag Lab (`nfc-tag-lab`)
- Description: Scan NFC targets, decode NDEF when available, classify known card/passport/ID signatures, and write editable tags locally.
- Metadata: Order `3`, icon `nfc`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/nfc-tag-lab/config.json`

### BLE Scanner (`ble-scanner`)
- Description: Scan nearby Bluetooth Low Energy devices and identify them with a built-in device database.
- Metadata: Order `10`, icon `bluetooth`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/ble-scanner/config.json`

### BLE Climate Monitor (`ble-climate-monitor`)
- Description: Connect to BLE temperature and humidity sensors like Mijia MJ_HT_V1 and compatible environmental devices.
- Metadata: Order `11`, icon `thermometer`, share target capable `no`, share target accepts `none`.
- Source: `src/tools/ble-climate-monitor/config.json`

## Notes

- `Order` uses the value from each config; `not set` means the field is missing.
- `Share target capable` is `yes` when `shareTarget.accept` has at least one entry.
- Re-run `bun run generate:tool-description` whenever tool metadata changes.
