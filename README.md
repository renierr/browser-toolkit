# 🛠️ Browser Toolkit

**Fast, offline, browser-only utilities.**  
No servers · 100% client-side · Installable PWA

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Live Demo](https://img.shields.io/badge/Live-Demo-success)](https://renierr.github.io/browser-toolkit/)

→ **[Try it live](https://renierr.github.io/browser-toolkit/)**

---

## 💡 What is it?

A growing, searchable collection of focused tools that run entirely in your browser. 

- **Privacy-First:** Zero server dependency. Your data never leaves your device.
- **Developer-Friendly:** Add your own tools in ~30 seconds.
- **Accessible:** Fully responsive, themable, and mobile-friendly.

## 🧰 Included Tools

*More tools are added regularly. Check the [live version](https://renierr.github.io/browser-toolkit/) for the complete list.*

- Code Formatter
- Color Picker & Checker
- Base64 Encoder/Decoder
- Image Redactor (crop, blur, pixel areas)
- PDF Viewer
- PDF Organizer 
- QR code generator/reader
- … (see live demo for newest)

## ✨ Features

- **Instant Search:** Live filtering to find the exact tool you need.
- **100% Offline (PWA):** Install it once, use it anywhere without an internet connection.
- **Auto-Detecting Tools:** Simply create a folder to add a new tool—the app handles the rest.
- **Modern UI:** Consistent, beautiful design powered by daisyUI and Tailwind.
- **Share Target:** Share files (images, text, PDFs) directly from your OS into the tools.
- **Workspace Isolation:** Per-tool isolated dependencies using `pnpm` workspaces.


## 🚀 Getting Started (Local Development)

Want to run this locally or add your own tools? Getting started is easy.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed.

### Installation

```bash
# Clone the repository
git clone https://github.com/renierr/browser-toolkit.git

# Navigate into the directory
cd browser-toolkit

# Install dependencies
pnpm install

# Start the development server
pnpm run dev
```

## 🏗️ How to add a new tool

Adding a tool takes about 30 seconds thanks to the auto-detection feature.    
See a more detailed instruction inside the repositories 'docs' folder.

1. Create a new folder in the `src/tools/` directory (or your specific tools folder).
2. Add your `index.ts`, `template.html` and `config.json` logic/styles.
3. The Vite configuration will automatically detect the new folder and add it to the main dashboard!

> **Note:** If your tool requires specific dependencies, you can manage them within that tool's folder utilizing the `pnpm` workspaces setup.

## 💻 Tech Stack

- **Bundler:** [Vite](https://vitejs.dev/)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [daisyUI](https://daisyui.com/)
- **Icons:** [Lucide Icons](https://lucide.dev/)
- **Package Manager:** `pnpm` (with workspaces)

## 📄 License

This project is licensed under the **AGPL-3.0 License**. See the [LICENSE](LICENSE) file for more details.
