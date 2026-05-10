# <img src="https://raw.githubusercontent.com/renierr/browser-toolkit/main/public/favicon.svg" alt="Logo" width="35" style="vertical-align: middle;"> Browser Toolkit

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

_More tools are added regularly. Check the [live version](https://renierr.github.io/browser-toolkit/) for the complete list._

- Code Formatter
- Color Picker & Checker
- Base64 Encoder/Decoder
- Image Redactor (crop, blur, pixel areas)
- PDF Viewer
- PDF Organizer
- QR code generator/reader
- … (see live demo for newest)

or [TOOLS.md](TOOLS.md) file

## ✨ Features

- **Instant Search:** Live filtering to find the exact tool you need.
- **100% Offline (PWA):** Install it once, use it anywhere without an internet connection.
- **Auto-Detecting Tools:** Simply create a folder to add a new tool—the app handles the rest.
- **Modern UI:** Consistent, beautiful design powered by daisyUI and Tailwind.
- **Share Target:** Share files (images, text, PDFs) directly from your OS into the tools.
- **Workspace Isolation:** Per-tool isolated dependencies using `bun` workspaces.

## 🚀 Getting Started

This toolkit can be run in two modes: **Static/Offline Mode** (default) or **Backend Mode** (for tools that require a server, like database interactions).

### Prerequisites

Make sure you have [Bun](https://bun.sh/) (preferred) or [Node.js](https://nodejs.org/) installed.

### Installation

```bash
# Clone the repository
git clone https://github.com/renierr/browser-toolkit.git

# Navigate into the directory
cd browser-toolkit

# Install all dependencies (Frontend & Tools)
bun install

# Install backend dependencies
cd backend
bun install
cd ..
```

### One-command setup (cross-platform)

This repository includes setup scripts for cloning, installing dependencies, building, and running.

#### Linux/macOS (`setup.sh`)

```bash
# Bootstrap into ~/browser-toolkit (clone if missing, install, build)
curl -fsSL https://raw.githubusercontent.com/renierr/browser-toolkit/main/setup.sh | bash -s -- bootstrap --dir "$HOME/browser-toolkit"

# or with wget
wget -qO- https://raw.githubusercontent.com/renierr/browser-toolkit/main/setup.sh | bash -s -- bootstrap --dir "$HOME/browser-toolkit"
```

#### Windows (`setup.ps1`)

```powershell
$path = "$env:TEMP\setup.ps1"
Invoke-WebRequest "https://raw.githubusercontent.com/renierr/browser-toolkit/main/setup.ps1" -OutFile $path
& $path bootstrap -Dir "$env:USERPROFILE\browser-toolkit"
```

> Tip: For reproducible installs, prefer pinning to a tag or commit instead of `main` in raw GitHub URLs.

> Linux note: If Bun was just installed, the setup script automatically checks `~/.bun/bin` so you can continue in the same shell.

> If your shell still cannot resolve Bun, run: `export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH"`.

> Debian note: Bun auto-install in `setup.sh` works with either `curl` or `wget`.

#### Useful script commands

```bash
# Linux/macOS
bash "$HOME/browser-toolkit/setup.sh" doctor --dir "$HOME/browser-toolkit"
bash "$HOME/browser-toolkit/setup.sh" update --dir "$HOME/browser-toolkit"
bash "$HOME/browser-toolkit/setup.sh" run --dir "$HOME/browser-toolkit" --port 3000
bash "$HOME/browser-toolkit/setup.sh" install-service --dir "$HOME/browser-toolkit"
```

```powershell
# Windows
.\setup.ps1 doctor -Dir "$env:USERPROFILE\browser-toolkit"
.\setup.ps1 update -Dir "$env:USERPROFILE\browser-toolkit"
.\setup.ps1 run -Dir "$env:USERPROFILE\browser-toolkit" -Port 3000
.\setup.ps1 install-service -Dir "$env:USERPROFILE\browser-toolkit" # prints manual instructions
```

`update` does: `git pull --ff-only`, `bun install` (root + backend), rebuild frontend, and restart managed service on Linux/macOS when installed.

### 1. Static/Offline Mode (Default)

If you only want the offline-capable browser tools:

```bash
# Start the development server
bun run dev
```

### 2. Backend Mode

If you want to develop or use tools that require a server backend:

**Development:**
You need two terminal windows to run the frontend and backend simultaneously. The frontend will automatically proxy API requests to the backend.

```bash
# Terminal 1 (Frontend): Starts Vite on http://localhost:5173
bun run dev

# Terminal 2 (Backend): Starts Bun on http://localhost:3000
cd backend
bun run dev
```

**Production:**
In production, the Bun backend efficiently serves both your APIs and the built frontend static files from a single port.

```bash
# 1. Build the frontend into the 'dist/' folder
bun run build

# 2. Start the production backend
cd backend
bun start
```

_Navigate to `http://localhost:3000` to see your deployed app._

## 🏗️ How to add a new tool

Adding a tool takes about 30 seconds thanks to the auto-detection feature.  
See a more detailed instruction inside the repositories 'docs' folder.

1. Create a new folder in the `src/tools/` directory (or your specific tools folder).
2. Add your `index.ts`, `template.html` and `config.json` logic/styles.
3. The Vite configuration will automatically detect the new folder and add it to the main dashboard!

Template includes support both local tool files and shared CSS via alias:

- Local file: `<include src="style.css" type="style" />`
- Shared CSS alias: `<include src="@css/markdown-content.css" type="style" />`

> **Note:** If your tool requires specific dependencies, you can manage them within that tool's folder utilizing the `bun` workspaces setup.

## 💻 Tech Stack

- **Bundler:** [Vite](https://vitejs.dev/)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [daisyUI](https://daisyui.com/)
- **Icons:** [Lucide Icons](https://lucide.dev/)
- **Package Manager:** `bun` (with workspaces)

## 📄 License

This project is licensed under the **AGPL-3.0 License**. See the [LICENSE](LICENSE) file for more details.
