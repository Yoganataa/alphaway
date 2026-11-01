#!/usr/bin/env bash
# AlphaWay source installer.
#
# Installs a complete, verified application snapshot under:
#   ~/.alphaway/app       application source + embedded-asset binary
#   ~/.alphaway/.env      persistent configuration
#   ~/.alphaway/*.sqlite  persistent application data
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Yoganataa/alphaway/main/install.sh | bash
#
# Options:
#   SOURCE=auto|local|remote   auto uses a nearby checkout when available
#   REPO=owner/repo            source repository
#   BRANCH=main                source branch for remote installs
#   BINDIR=/absolute/path      persistent state/install root
#   PORT=20129 HOST=127.0.0.1  bind configuration
#   NO_SERVICE=1               skip systemd/launchd registration
#   NO_START=1                 install only; do not start the gateway
#
# Updates stage and build the complete app before replacing the installed app.
# The state directory and .env are kept outside app/, so upgrades preserve data.

set -Eeuo pipefail

PORT="${PORT:-20129}"
HOST="${HOST:-127.0.0.1}"
REPO="${REPO:-Yoganataa/alphaway}"
BRANCH="${BRANCH:-main}"
BINDIR="${BINDIR:-$HOME/.alphaway}"
SOURCE="${SOURCE:-auto}"
NO_SERVICE="${NO_SERVICE:-0}"
NO_START="${NO_START:-0}"
MIN_BUN_VERSION="1.4.3"
APPDIR="$BINDIR/app"

SOURCE_PATH="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=""
if [ -n "$SOURCE_PATH" ] && [ -f "$SOURCE_PATH" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$SOURCE_PATH")" && pwd)"
fi

say()  { printf '[AlphaWay] %s\n' "$*"; }
warn() { printf '[AlphaWay] WARNING: %s\n' "$*" >&2; }
die()  { printf '[AlphaWay] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Invalid PORT: $PORT"
[[ "$HOST" =~ ^[A-Za-z0-9.:_-]+$ ]] || die "Invalid HOST: $HOST"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "Invalid REPO: $REPO"
case "$BINDIR" in *$'\n'*|*$'\r'*) die "BINDIR cannot contain a newline" ;; esac

find_bun() {
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  local candidate
  for candidate in "${BUN_INSTALL:-}/bin/bun" "$HOME/.bun/bin/bun" "$HOME/.local/bin/bun" /usr/local/bin/bun /opt/bun/bin/bun; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

if ! BUN_BIN="$(find_bun)"; then
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || die "curl or wget is required to install Bun"
  say "Bun not found; installing the required runtime"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
  else
    wget -qO- https://bun.sh/install | bash
  fi
  BUN_BIN="$(find_bun)" || die "Bun installation finished but bun could not be found"
fi

BUN_VERSION="$("$BUN_BIN" --version)"
if ! ALPHAWAY_BUN_VERSION="$BUN_VERSION" ALPHAWAY_MIN_BUN_VERSION="$MIN_BUN_VERSION" "$BUN_BIN" -e '
  const [major, minor, patch] = process.env.ALPHAWAY_BUN_VERSION.split(".").map(Number);
  const [minMajor, minMinor, minPatch] = process.env.ALPHAWAY_MIN_BUN_VERSION.split(".").map(Number);
  const current = [major || 0, minor || 0, patch || 0];
  const minimum = [minMajor, minMinor, minPatch];
  let comparison = 0;
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== minimum[i]) {
      comparison = current[i] > minimum[i] ? 1 : -1;
      break;
    }
  }
  if (comparison < 0) process.exit(1);
'; then
  die "Bun >= $MIN_BUN_VERSION is required (found $BUN_VERSION)"
fi
say "Using Bun $BUN_VERSION"

mkdir -p "$BINDIR"
BINDIR="$(cd "$BINDIR" && pwd)"
APPDIR="$BINDIR/app"
STAGE="$(mktemp -d "$BINDIR/.stage.XXXXXX")"
STAGED_APP="$STAGE/app"
BACKUP=""
SERVICE_SCOPE="none"
mkdir -p "$STAGED_APP"

cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

# --------------------------------------------------------------- source ---
if [ "$SOURCE" = "auto" ]; then
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/src/index.ts" ] && [ -f "$SCRIPT_DIR/bun.lock" ]; then
    SOURCE="local"
  else
    SOURCE="remote"
  fi
fi

if [ "$SOURCE" = "local" ]; then
  [ -n "$SCRIPT_DIR" ] || die "SOURCE=local requires install.sh to be run from a checkout"
  [ -f "$SCRIPT_DIR/src/index.ts" ] && [ -f "$SCRIPT_DIR/bun.lock" ] || die "Local checkout does not match the current TypeScript project layout"
  say "Using local checkout: $SCRIPT_DIR"
  tar -C "$SCRIPT_DIR" \
    --exclude=.git --exclude=node_modules --exclude=dist --exclude=.env \
    --exclude='*.sqlite' --exclude='*.sqlite-wal' --exclude='*.sqlite-shm' \
    -cf - . | tar -C "$STAGED_APP" -xf -
elif [ "$SOURCE" = "remote" ]; then
  ARCHIVE="$STAGE/source.tar.gz"
  ARCHIVE_URL="https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH"
  say "Downloading source snapshot: $REPO@$BRANCH"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 1 "$ARCHIVE_URL" -o "$ARCHIVE" \
      || die "Could not download source archive from $ARCHIVE_URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$ARCHIVE" "$ARCHIVE_URL" || die "Could not download source archive from $ARCHIVE_URL"
  else
    die "curl or wget is required to download source"
  fi
  tar -xzf "$ARCHIVE" --strip-components=1 -C "$STAGED_APP" \
    || die "Downloaded source archive could not be extracted"
else
  die "Invalid SOURCE: $SOURCE (expected auto, local, or remote)"
fi

for required in package.json bun.lock src/index.ts src/app.ts install.sh; do
  [ -s "$STAGED_APP/$required" ] || die "Source snapshot is missing required file: $required"
done

# ---------------------------------------------------------- build/verify ---
say "Installing locked dependencies"
(
  cd "$STAGED_APP"
  "$BUN_BIN" install --frozen-lockfile
)

say "Checking the OpenCode TLS fingerprint before installation"
(
  cd "$STAGED_APP"
  "$BUN_BIN" run fingerprint:check
) || die "This Bun runtime does not match the recorded transport fingerprint; the existing installation was not changed"

say "Building the dashboard and standalone executable"
(
  cd "$STAGED_APP"
  "$BUN_BIN" run build
)

[ -s "$STAGED_APP/dist/index.html" ] || die "Dashboard build did not produce dist/index.html"
[ -s "$STAGED_APP/alphaway" ] || die "Standalone executable was not produced"
chmod +x "$STAGED_APP/alphaway"
(
  cd "$STAGED_APP"
  ./alphaway --version
) || die "Standalone executable failed its startup check"

# Keep local configuration and SQLite data outside the replaceable app tree.
if [ ! -f "$BINDIR/.env" ]; then
  cp "$STAGED_APP/.env.example" "$BINDIR/.env"
  chmod 600 "$BINDIR/.env"
  say "Created configuration at $BINDIR/.env"
fi

# --------------------------------------------------------- service stop ---
stop_managed_background() {
  local pid_file="$BINDIR/alphaway.pid"
  [ -f "$pid_file" ] || return 0
  local pid command_line
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || { rm -f "$pid_file"; return 0; }
  kill -0 "$pid" 2>/dev/null || { rm -f "$pid_file"; return 0; }

  command_line=""
  if [ -r "/proc/$pid/cmdline" ]; then
    command_line="$(tr '\\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  else
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  fi

  case "$command_line" in
    *"$BINDIR/app/alphaway"*)
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      ;;
    *)
      warn "PID file does not point to the installed AlphaWay executable; leaving PID $pid untouched"
      ;;
  esac
  rm -f "$pid_file"
}

stop_existing_services() {
  stop_managed_background
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop alphaway opencode-free-bridge opencode-bridge 2>/dev/null || true
    systemctl --user stop alphaway opencode-free-bridge opencode-bridge 2>/dev/null || true
  fi

  if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/com.alphaway" 2>/dev/null || true
  fi
}

stop_existing_services

# Refuse to overwrite an installation while an unmanaged process still holds
# the configured port. This avoids killing an unrelated local service.
port_is_listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :$PORT" 2>/dev/null | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

if port_is_listening; then
  die "Port $PORT is still occupied. Stop the unmanaged process or choose another PORT; the existing app files were not replaced."
fi

# ---------------------------------------------------------- atomic swap ---
if [ -d "$APPDIR" ]; then
  BACKUP="$BINDIR/.backup-app-$(date +%Y%m%d%H%M%S)"
  mv "$APPDIR" "$BACKUP"
  say "Previous app preserved at $BACKUP"
fi

if ! mv "$STAGED_APP" "$APPDIR"; then
  if [ -n "$BACKUP" ] && [ -d "$BACKUP" ]; then
    mv "$BACKUP" "$APPDIR"
  fi
  die "Could not place the staged application; previous app has been restored"
fi

ln -sfn "$BINDIR/.env" "$APPDIR/.env"

# --------------------------------------------------------------- service ---
install_system_service() {
  local unit_dir="/etc/systemd/system"
  local unit="$unit_dir/alphaway.service"
  [ -d "$unit_dir" ] && [ -w "$unit_dir" ] || return 1

  cat > "$unit" <<UNIT
[Unit]
Description=AlphaWay Universal AI Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory="$APPDIR"
Environment=PORT=$PORT
Environment=HOST=$HOST
Environment="ALPHAWAY_STATE_DIR=$BINDIR"
ExecStart="$APPDIR/alphaway"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable alphaway >/dev/null
  systemctl restart alphaway
  SERVICE_SCOPE="system"
  return 0
}

install_user_service() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl --user status >/dev/null 2>&1 || return 1

  local unit_dir="$HOME/.config/systemd/user"
  local unit="$unit_dir/alphaway.service"
  mkdir -p "$unit_dir"

  cat > "$unit" <<UNIT
[Unit]
Description=AlphaWay Universal AI Gateway
After=network-online.target

[Service]
Type=simple
WorkingDirectory="$APPDIR"
Environment=PORT=$PORT
Environment=HOST=$HOST
Environment="ALPHAWAY_STATE_DIR=$BINDIR"
ExecStart="$APPDIR/alphaway"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  systemctl --user enable alphaway >/dev/null
  systemctl --user restart alphaway
  SERVICE_SCOPE="user"
  return 0
}

install_launchd_service() {
  [ "$(uname -s)" = "Darwin" ] || return 1
  command -v launchctl >/dev/null 2>&1 || return 1

  local plist="$HOME/Library/LaunchAgents/com.alphaway.plist"
  mkdir -p "$(dirname "$plist")" "$HOME/Library/Logs"

  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.alphaway</string>
  <key>ProgramArguments</key>
  <array><string>$APPDIR/alphaway</string></array>
  <key>WorkingDirectory</key><string>$APPDIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>HOST</key><string>$HOST</string>
    <key>ALPHAWAY_STATE_DIR</key><string>$BINDIR</string>
  </dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/alphaway.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/alphaway.log</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLIST

  launchctl bootstrap "gui/$(id -u)" "$plist"
  SERVICE_SCOPE="launchd"
  return 0
}

start_background() {
  local log_file="$BINDIR/alphaway.log"
  (
    cd "$APPDIR"
    nohup env PORT="$PORT" HOST="$HOST" ALPHAWAY_STATE_DIR="$BINDIR" \
      "$APPDIR/alphaway" </dev/null >>"$log_file" 2>&1 &
    echo $! > "$BINDIR/alphaway.pid"
  )
}

if [ "$NO_START" = "1" ]; then
  say "Installed without starting the gateway (NO_START=1)"
  exit 0
fi

if [ "$NO_SERVICE" != "1" ]; then
  if install_system_service; then
    say "Installed systemd service"
  elif install_user_service; then
    say "Installed user systemd service"
  elif install_launchd_service; then
    say "Installed launchd agent"
  else
    warn "No supported service manager found; starting in the background"
    start_background
  fi
else
  start_background
fi

# ------------------------------------------------------------- healthcheck ---
PROBE_HOST="$HOST"
if [ "$PROBE_HOST" = "0.0.0.0" ] || [ "$PROBE_HOST" = "::" ]; then
  PROBE_HOST="127.0.0.1"
fi

probe_health() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 2 "http://$PROBE_HOST:$PORT/health" >/dev/null 2>&1
  else
    "$BUN_BIN" -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(2000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' \
      "http://$PROBE_HOST:$PORT/health" >/dev/null 2>&1
  fi
}

say "Waiting for AlphaWay health endpoint"
BRIDGE_UP=0
for _ in $(seq 1 20); do
  if probe_health; then
    BRIDGE_UP=1
    break
  fi
  sleep 1
done

if [ "$BRIDGE_UP" != "1" ]; then
  warn "AlphaWay did not answer on http://$PROBE_HOST:$PORT/health"
  case "$SERVICE_SCOPE" in
    system) warn "Inspect with: systemctl status alphaway && journalctl -u alphaway -n 80" ;;
    user) warn "Inspect with: systemctl --user status alphaway && journalctl --user -u alphaway -n 80" ;;
    launchd) warn "Inspect with: tail -n 80 $HOME/Library/Logs/alphaway.log" ;;
    *) warn "Inspect with: tail -n 80 $BINDIR/alphaway.log" ;;
  esac

  # Restore the previous app when an upgrade fails its health check.
  if [ -n "$BACKUP" ] && [ -d "$BACKUP" ]; then
    stop_existing_services
    mv "$APPDIR" "$BINDIR/.failed-app-$(date +%Y%m%d%H%M%S)"
    mv "$BACKUP" "$APPDIR"
    ln -sfn "$BINDIR/.env" "$APPDIR/.env"
    warn "Previous app files restored from backup; restart the previous service manually if needed"
  fi
  die "Installation did not pass its health check"
fi

say "AlphaWay is healthy"
say "Dashboard : http://$PROBE_HOST:$PORT/"
say "API       : http://$PROBE_HOST:$PORT/v1"
say "Config    : $BINDIR/.env"
say "State     : $BINDIR"
case "$SERVICE_SCOPE" in
  system) say "Logs      : journalctl -u alphaway -f" ;;
  user) say "Logs      : journalctl --user -u alphaway -f" ;;
  launchd) say "Logs      : tail -f $HOME/Library/Logs/alphaway.log" ;;
  *) say "Logs      : tail -f $BINDIR/alphaway.log" ;;
esac
