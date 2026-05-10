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

hydrate_bun_path() {
  if command -v bun >/dev/null 2>&1; then
    return
  fi

  local bun_bin_dir="${BUN_INSTALL:-$HOME/.bun}/bin"
  if [[ -x "$bun_bin_dir/bun" ]]; then
    export PATH="$bun_bin_dir:$PATH"
    return
  fi

  if [[ -x "$HOME/.bun/bin/bun" ]]; then
    export PATH="$HOME/.bun/bin:$PATH"
    return
  fi

  if [[ -x "$HOME/.local/bin/bun" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
    return
  fi

  if [[ -x "/usr/local/bin/bun" ]]; then
    export PATH="/usr/local/bin:$PATH"
    return
  fi

  local login_bun=""
  login_bun="$(bash -lc 'command -v bun' 2>/dev/null || true)"
  if [[ -n "$login_bun" ]]; then
    export PATH="$(dirname "$login_bun"):$PATH"
  fi
}

resolve_bun() {
  hydrate_bun_path
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return
  fi

  ensure_cmd bun
  command -v bun
}

is_linux() {
  [[ "$(uname -s)" == Linux* ]]
}

can_prompt() {
  [[ -r /dev/tty ]]
}

ask_yes_no() {
  local prompt="$1"
  local answer=""

  if ! can_prompt; then
    return 1
  fi

  printf '[setup] %s [y/N]: ' "$prompt" > /dev/tty
  read -r answer < /dev/tty || return 1
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

run_with_privilege() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  err "Need root privileges for install. Re-run as root or install sudo."
}

install_bun_linux() {
  if ! command -v curl >/dev/null 2>&1; then
    err "curl required to install Bun. Install curl first."
  fi

  log "Installing Bun via official installer"
  curl -fsSL https://bun.com/install | bash

  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1; then
    err "Bun install finished but bun still unavailable. Try: export BUN_INSTALL=\"$HOME/.bun\" && export PATH=\"$BUN_INSTALL/bin:$PATH\""
  fi
}

install_git_linux() {
  log "Installing git via detected package manager"

  if command -v apt-get >/dev/null 2>&1; then
    run_with_privilege apt-get update
    run_with_privilege apt-get install -y git
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    run_with_privilege dnf install -y git
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    run_with_privilege yum install -y git
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    run_with_privilege pacman -Sy --noconfirm git
    return
  fi

  if command -v zypper >/dev/null 2>&1; then
    run_with_privilege zypper --non-interactive install git
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    run_with_privilege apk add git
    return
  fi

  err "Unsupported Linux package manager. Install git manually."
}

ensure_cmd() {
  local cmd="$1"

  if [[ "$cmd" == "bun" ]]; then
    hydrate_bun_path
  fi

  if command -v "$cmd" >/dev/null 2>&1; then
    return
  fi

  if ! is_linux; then
    err "Missing command: $cmd"
  fi

  case "$cmd" in
    bun)
      if ask_yes_no "bun not found. Install now with: curl -fsSL https://bun.com/install | bash ?"; then
        install_bun_linux
      else
        err "bun is required"
      fi
      ;;
    git)
      if ask_yes_no "git not found. Try automatic install via your Linux package manager?"; then
        install_git_linux
      else
        err "git is required"
      fi
      ;;
    *)
      err "Missing command: $cmd"
      ;;
  esac
}

repo_dir_exists() {
  [[ -d "$TARGET_DIR" ]] && [[ -f "$TARGET_DIR/package.json" ]] && [[ -d "$TARGET_DIR/backend" ]]
}

doctor() {
  log "Checking required tools"
  ensure_cmd git
  ensure_cmd bun
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
  local bun_bin
  bun_bin="$(resolve_bun)"

  log "Installing root dependencies"
  "$bun_bin" install --cwd "$TARGET_DIR"

  log "Installing backend dependencies"
  "$bun_bin" install --cwd "$TARGET_DIR/backend"
}

build_frontend() {
  repo_dir_exists || err "Repo not found at $TARGET_DIR"
  local bun_bin
  bun_bin="$(resolve_bun)"
  log "Building frontend dist/"
  "$bun_bin" run --cwd "$TARGET_DIR" build
}

run_backend() {
  repo_dir_exists || err "Repo not found at $TARGET_DIR"
  local bun_bin
  bun_bin="$(resolve_bun)"
  log "Starting backend at PORT=$PORT"
  PORT="$PORT" "$bun_bin" run --cwd "$TARGET_DIR/backend" start
}

install_service_linux() {
  need_cmd systemctl
  local unit_path="/etc/systemd/system/browser-toolkit.service"
  local bun_path
  bun_path="$(resolve_bun)"

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
  bun_path="$(resolve_bun)"

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
  log "Run now: bash \"$TARGET_DIR/setup.sh\" run --dir \"$TARGET_DIR\" --port \"$PORT\""
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
