#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/renierr/browser-toolkit"
TARGET_DIR="${HOME}/browser-toolkit"
PORT="3000"

print_help() {
  cat <<'EOF'
browser-toolkit setup

Usage:
  ./setup.sh <command> [options]

Commands:
  bootstrap         Clone (if missing), install deps, build frontend
  doctor            Check required tools (git, bun)
  install           Install deps in repo root and backend
  build             Build frontend dist/
  run               Run backend server (serves dist/)
  install-service   Install and start service (Linux/macOS)
  uninstall-service Remove service (Linux/macOS)
  help              Show this help

Options:
  --dir <path>      Target repo directory
  --repo <url>      Git repository URL
  --port <number>   Backend port (default: 3000)

Examples:
  ./setup.sh bootstrap --dir "$HOME/browser-toolkit"
  ./setup.sh run --dir "$HOME/browser-toolkit" --port 3000
EOF
}

log() {
  printf '[setup] %s\n' "$1"
}

err() {
  printf '[setup] ERROR: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "Missing command: $cmd"
  fi
}

repo_dir_exists() {
  [[ -d "$TARGET_DIR" ]] && [[ -f "$TARGET_DIR/package.json" ]] && [[ -d "$TARGET_DIR/backend" ]]
}

doctor() {
  log "Checking required tools"
  need_cmd git
  need_cmd bun
  log "OK: git and bun found"
}

clone_repo_if_needed() {
  local parent
  parent="$(dirname "$TARGET_DIR")"
  mkdir -p "$parent"

  if repo_dir_exists; then
    log "Repo already present at $TARGET_DIR"
    return
  fi

  if [[ -e "$TARGET_DIR" ]] && [[ ! -d "$TARGET_DIR/.git" ]]; then
    err "Target exists but is not a git clone: $TARGET_DIR"
  fi

  log "Cloning repository: $REPO_URL"
  git clone "$REPO_URL" "$TARGET_DIR"
}

install_deps() {
  repo_dir_exists || err "Repo not found at $TARGET_DIR"

  log "Installing root dependencies"
  bun install --cwd "$TARGET_DIR"

  log "Installing backend dependencies"
  bun install --cwd "$TARGET_DIR/backend"
}

build_frontend() {
  repo_dir_exists || err "Repo not found at $TARGET_DIR"
  log "Building frontend dist/"
  bun run --cwd "$TARGET_DIR" build
}

run_backend() {
  repo_dir_exists || err "Repo not found at $TARGET_DIR"
  log "Starting backend at PORT=$PORT"
  PORT="$PORT" bun run --cwd "$TARGET_DIR/backend" start
}

install_service_linux() {
  need_cmd systemctl
  local unit_path="/etc/systemd/system/browser-toolkit.service"
  local bun_path
  bun_path="$(command -v bun)"

  log "Installing systemd service (requires sudo)"
  sudo tee "$unit_path" >/dev/null <<EOF
[Unit]
Description=Browser Toolkit Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=$TARGET_DIR/backend
ExecStart=$bun_path run start
Environment=PORT=$PORT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable --now browser-toolkit.service
  log "Service active: browser-toolkit.service"
}

install_service_macos() {
  local launch_dir="$HOME/Library/LaunchAgents"
  local plist_path="$launch_dir/com.browsertoolkit.backend.plist"
  local bun_path
  bun_path="$(command -v bun)"

  mkdir -p "$launch_dir"

  log "Installing launchd agent"
  cat >"$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.browsertoolkit.backend</string>
    <key>ProgramArguments</key>
    <array>
      <string>$bun_path</string>
      <string>run</string>
      <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$TARGET_DIR/backend</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PORT</key>
      <string>$PORT</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/browser-toolkit-backend.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/browser-toolkit-backend.err.log</string>
  </dict>
</plist>
EOF

  launchctl unload "$plist_path" >/dev/null 2>&1 || true
  launchctl load "$plist_path"
  log "Agent active: com.browsertoolkit.backend"
}

install_service() {
  repo_dir_exists || err "Repo not found at $TARGET_DIR"

  case "$(uname -s)" in
    Linux*) install_service_linux ;;
    Darwin*) install_service_macos ;;
    *) err "install-service supports Linux/macOS only in setup.sh" ;;
  esac
}

uninstall_service_linux() {
  log "Removing systemd service (requires sudo)"
  sudo systemctl disable --now browser-toolkit.service || true
  sudo rm -f /etc/systemd/system/browser-toolkit.service
  sudo systemctl daemon-reload
}

uninstall_service_macos() {
  local plist_path="$HOME/Library/LaunchAgents/com.browsertoolkit.backend.plist"
  log "Removing launchd agent"
  launchctl unload "$plist_path" >/dev/null 2>&1 || true
  rm -f "$plist_path"
}

uninstall_service() {
  case "$(uname -s)" in
    Linux*) uninstall_service_linux ;;
    Darwin*) uninstall_service_macos ;;
    *) err "uninstall-service supports Linux/macOS only in setup.sh" ;;
  esac

  log "Service removed"
}

bootstrap() {
  doctor
  clone_repo_if_needed
  install_deps
  build_frontend
  log "Bootstrap done"
  log "Run now: ./setup.sh run --dir \"$TARGET_DIR\""
}

COMMAND="${1:-help}"
if [[ $# -gt 0 ]]; then
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    --repo)
      REPO_URL="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    -h|--help)
      COMMAND="help"
      shift
      ;;
    *)
      err "Unknown option: $1"
      ;;
  esac
done

case "$COMMAND" in
  bootstrap) bootstrap ;;
  doctor) doctor ;;
  install) install_deps ;;
  build) build_frontend ;;
  run) run_backend ;;
  install-service) install_service ;;
  uninstall-service) uninstall_service ;;
  help) print_help ;;
  *) err "Unknown command: $COMMAND" ;;
esac
