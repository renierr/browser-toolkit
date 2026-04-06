# Tools Inventory

This file lists all registered tools from `src/tools/*/config.json`.

- Total tools: **49**
- Sections: `devices`, `general`, `images`, `media`, `pdf`, `utilities`
- Source of truth for each entry: `src/tools/<tool-id>/config.json`

## Devices (3)

### Heart Rate Monitor (`heart-rate-monitor`)
- Description: Connect to a Bluetooth heart rate monitor and track live pulse measurements.
- Metadata: Order `1`, icon `heart`, share target `none`.
- Source: `src/tools/heart-rate-monitor/config.json`

### Treadmill Control (`treadmill-control`)
- Description: Connect to an FTMS treadmill to monitor workouts and control speed or incline.
- Metadata: Order `2`, icon `activity`, share target `none`.
- Source: `src/tools/treadmill-control/config.json`

### BLE Scanner (`ble-scanner`)
- Description: Scan nearby Bluetooth Low Energy devices and identify them with a built-in device database.
- Metadata: Order `10`, icon `bluetooth`, share target `none`.
- Source: `src/tools/ble-scanner/config.json`

## General (11)

### QR Scanner (`qr-scanner`)
- Description: Scan QR codes from the camera or image files.
- Metadata: Order `1`, icon `qr-code`, share target `none`.
- Source: `src/tools/qr-scanner/config.json`

### QR Generator (`qr-generator`)
- Description: Create QR codes from text or URLs with size and color customization.
- Metadata: Order `2`, icon `qr-code`, share target `none`.
- Source: `src/tools/qr-generator/config.json`

### Notes (`notes`)
- Description: Write notes with search and date-based organization.
- Metadata: Order `3`, icon `notebook-pen`, share target `none`.
- Source: `src/tools/notes/config.json`

### Signature Creator (`signature-creator`)
- Description: Draw signatures and export them as transparent images or SVG paths.
- Metadata: Order `4`, icon `pen-tool`, share target `none`.
- Source: `src/tools/signature-creator/config.json`

### Morse Code (`morse-code`)
- Description: Convert text to Morse code and play it as audio or visual signals.
- Metadata: Order `5`, icon `radio`, share target `audio/*`.
- Source: `src/tools/morse-code/config.json`

### Braille & Sign Language (`braille-sign-language`)
- Description: Translate typed text into Braille patterns and ASL alphabet visuals.
- Metadata: Order `10`, icon `hand`, share target `none`.
- Source: `src/tools/braille-sign-language/config.json`

### GPS Location Store (`gps-location-store`)
- Description: Save GPS locations, review history, and calculate traveled distance.
- Metadata: Order `10`, icon `map-pin`, share target `none`.
- Source: `src/tools/gps-location-store/config.json`

### Grocery List (`grocery-list`)
- Description: Create grocery lists with quantities, reusable items, and check-off tracking.
- Metadata: Order `10`, icon `shopping-cart`, share target `none`.
- Source: `src/tools/grocery-list/config.json`

### Timer (`timer`)
- Description: Run countdown timers with presets and notifications.
- Metadata: Order `10`, icon `timer`, share target `none`.
- Source: `src/tools/timer/config.json`

### Battery Info (`battery-info`)
- Description: Display battery level, charging state, and related device battery details.
- Metadata: Order `11`, icon `battery`, share target `none`.
- Source: `src/tools/battery-info/config.json`

### Markdown Viewer (`markdown-viewer`)
- Description: Render Markdown files with GitHub Flavored Markdown extensions.
- Metadata: Order `not set`, icon `file-text`, share target `text/markdown`, `text/x-markdown`, `text/plain`, `application/octet-stream`.
- Source: `src/tools/markdown-viewer/config.json`

## Images (8)

### AI Background Remover (`background-remover`)
- Description: Remove image backgrounds locally with an AI segmentation model.
- Metadata: Order `5`, icon `eraser`, share target `image/*`.
- Source: `src/tools/background-remover/config.json`

### AI Image Magic (`image-manipulation`)
- Description: Apply AI image effects such as upscaling and line-art conversion.
- Metadata: Order `5`, icon `sparkles`, share target `image/*`.
- Source: `src/tools/image-manipulation/config.json`

### Document Scanner (`document-scanner`)
- Description: Capture documents, correct perspective, and apply cleanup filters for readable scans.
- Metadata: Order `10`, icon `scan`, share target `image/*`.
- Source: `src/tools/document-scanner/config.json`

### EXIF Cleaner & Viewer (`exif-cleaner`)
- Description: Inspect image metadata and remove EXIF data from selected files.
- Metadata: Order `10`, icon `image`, share target `image/*`.
- Source: `src/tools/exif-cleaner/config.json`

### Images to PDF (`images-to-pdf`)
- Description: Combine multiple images into a single PDF document.
- Metadata: Order `10`, icon `file-image`, share target `image/*`.
- Source: `src/tools/images-to-pdf/config.json`

### OCR Text Extractor (`ocr-extractor`)
- Description: Extract text from images using OCR.
- Metadata: Order `10`, icon `scan-text`, share target `image/*`.
- Source: `src/tools/ocr-extractor/config.json`

### Image Convert / Redact (`image-redactor`)
- Description: Convert, crop, redact, and pixelate images.
- Metadata: Order `not set`, icon `crop`, share target `image/*`.
- Source: `src/tools/image-redactor/config.json`

### Image Vectorizer (`image-vectorizer`)
- Description: Convert raster images into scalable SVG vector graphics.
- Metadata: Order `not set`, icon `image`, share target `none`.
- Source: `src/tools/image-vectorizer/config.json`

## Media (5)

### Chiptune (`chiptune`)
- Description: Play MOD, XM, and IT tracker files with waveform and spectrum visualizations.
- Metadata: Order `1`, icon `headphones`, share target `audio/x-mod`, `audio/xm`, `audio/it`, `audio/x-s3m`, `audio/*`.
- Source: `src/tools/chiptune/config.json`

### Focus Noise & Breathing (`noise-generator`)
- Description: Generate ambient noise and guide paced breathing sessions for focus or relaxation.
- Metadata: Order `1`, icon `waves`, share target `none`.
- Source: `src/tools/noise-generator/config.json`

### Chiptune Tracker (`chiptune-tracker`)
- Description: Load, edit, and export Amiga MOD tracker files with sample-accurate playback.
- Metadata: Order `2`, icon `music`, share target `audio/x-mod`, `audio/mod`, `application/octet-stream`.
- Source: `src/tools/chiptune-tracker/config.json`

### Audio Recorder (`audio-recorder`)
- Description: Record audio, preview the waveform, and save the result as WebM.
- Metadata: Order `6`, icon `mic`, share target `none`.
- Source: `src/tools/audio-recorder/config.json`

### Video Transcoder (`video-transcoder`)
- Description: Convert and compress video files with FFmpeg.wasm.
- Metadata: Order `not set`, icon `video`, share target `video/*`.
- Source: `src/tools/video-transcoder/config.json`

## PDF (7)

### PDF Viewer / Editor (`pdf-viewer`)
- Description: View and edit PDF files with EmbedPDF.
- Metadata: Order `1`, icon `file-pen`, share target `application/pdf`.
- Source: `src/tools/pdf-viewer/config.json`

### HTML to PDF (`html-to-pdf`)
- Description: Generate a PDF document from HTML content.
- Metadata: Order `2`, icon `file-pen-line`, share target `none`.
- Source: `src/tools/html-to-pdf/config.json`

### Flatten PDF as Image (`pdf-to-image`)
- Description: Flatten each PDF page into image output.
- Metadata: Order `3`, icon `scan-text`, share target `application/pdf`.
- Source: `src/tools/pdf-to-image/config.json`

### Extract images (`pdf-extract-images`)
- Description: Extract embedded images from PDF documents.
- Metadata: Order `4`, icon `image-down`, share target `application/pdf`.
- Source: `src/tools/pdf-extract-images/config.json`

### PDF Organizer (`pdf-organizer`)
- Description: Merge, reorder, remove, and duplicate pages in PDF documents.
- Metadata: Order `5`, icon `layout-grid`, share target `application/pdf`.
- Source: `src/tools/pdf-organizer/config.json`

### PDF Un-/locker (`pdf-remove-restrictions`)
- Description: Update PDF permission flags for printing, copying, and editing.
- Metadata: Order `6`, icon `unlock`, share target `application/pdf`.
- Source: `src/tools/pdf-remove-restrictions/config.json`

### PDF Metadata Viewer (`pdf-metadata`)
- Description: View and export PDF metadata such as title, author, and keywords.
- Metadata: Order `100`, icon `info`, share target `application/pdf`.
- Source: `src/tools/pdf-metadata/config.json`

## Utilities (15)

### Calculator (`calculator`)
- Description: Run scientific calculations with expression history and mobile-friendly controls.
- Metadata: Order `5`, icon `calculator`, share target `none`.
- Source: `src/tools/calculator/config.json`

### Code Formatter (`code-formatter`)
- Description: Format, minify, and highlight source code and structured data.
- Metadata: Order `10`, icon `code`, share target `text/*`, `application/json`, `application/xml`, `application/javascript`, `application/typescript`, `application/yaml`, `application/toml`, `application/sql`, `application/ld+json`, `application/rtf`, `application/xhtml+xml`, `application/manifest+json`, `application/xslt+xml`, `application/atom+xml`, `application/rss+xml`, `application/x-httpd-php`, `application/x-sh`, `application/x-csh`, `application/x-latex`, `application/x-tcl`, `application/x-perl`, `application/x-python`.
- Source: `src/tools/code-formatter/config.json`

### Color Checker (`color-contrast`)
- Description: Check WCAG color contrast, sample image colors, and pick accessible color pairs.
- Metadata: Order `10`, icon `palette`, share target `none`.
- Source: `src/tools/color-contrast/config.json`

### Hex Editor (`hex-editor`)
- Description: Inspect and edit files in hexadecimal and ASCII views.
- Metadata: Order `10`, icon `binary`, share target `*/*`.
- Source: `src/tools/hex-editor/config.json`

### Periodic Table (`periodic-table`)
- Description: Explore an interactive periodic table with shells, isotopes, and atomic details.
- Metadata: Order `10`, icon `atom`, share target `none`.
- Source: `src/tools/periodic-table/config.json`

### Survival Guide (`survival-guide`)
- Description: Read survival guides for wilderness, emergency, and disaster scenarios.
- Metadata: Order `10`, icon `book-open`, share target `none`.
- Source: `src/tools/survival-guide/config.json`

### Archive Viewer (`archive-viewer`)
- Description: View archive contents and extract selected files from ZIP, TAR, TAR.GZ, and 7Z files.
- Metadata: Order `11`, icon `archive`, share target `application/zip`, `application/x-tar`, `application/gzip`, `application/x-7z-compressed`, `application/x-xz`.
- Source: `src/tools/archive-viewer/config.json`

### SVG Optimizer (`svg-optimizer`)
- Description: Optimize and minify SVG files from pasted code or uploaded files.
- Metadata: Order `11`, icon `image`, share target `image/svg+xml`.
- Source: `src/tools/svg-optimizer/config.json`

### Share Debug (`share-debug`)
- Description: Inspect shared files and MIME types for share-target debugging.
- Metadata: Order `100`, icon `bug`, share target `*/*`.
- Source: `src/tools/share-debug/config.json`

### WebRTC Drop (P2P) (`webrtc-drop`)
- Description: Transfer large files peer-to-peer over WebRTC on the local network.
- Metadata: Order `100`, icon `share-2`, share target `none`.
- Source: `src/tools/webrtc-drop/config.json`

### Base64 Encoder/Decoder (`base64`)
- Description: Encode and decode text using Base64 with UTF-8 support.
- Metadata: Order `not set`, icon `binary`, share target `none`.
- Source: `src/tools/base64/config.json`

### File Converter (`file-converter`)
- Description: Convert documents between commonly used file formats.
- Metadata: Order `not set`, icon `file-text`, share target `text/*`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/xhtml+xml`, `text/markdown`, `text/html`, `application/epub+zip`.
- Source: `src/tools/file-converter/config.json`

### KeePass Viewer (`keepass-viewer`)
- Description: Open KeePass (.kdbx) databases to browse groups and copy credentials securely.
- Metadata: Order `not set`, icon `lock`, share target `application/x-keepass`, `.kdbx`.
- Source: `src/tools/keepass-viewer/config.json`

### Regex Visualizer (`regex-visualizer`)
- Description: Visualize regular expressions as railroad diagrams to explain matching behavior.
- Metadata: Order `not set`, icon `regex`, share target `none`.
- Source: `src/tools/regex-visualizer/config.json`

### SQLite Explorer (`sqlite-explorer`)
- Description: Open SQLite databases, browse schemas, and run SQL queries.
- Metadata: Order `not set`, icon `database`, share target `application/vnd.sqlite3`, `application/x-sqlite3`, `.sqlite`, `.sqlite3`, `.db`.
- Source: `src/tools/sqlite-explorer/config.json`

## Notes

- `Order` shows the current value from each `config.json`; `not set` means no explicit order is set.
- `Share target` lists accepted MIME types/extensions from `shareTarget.accept`.
- Update this file when tools are added, removed, or renamed.
