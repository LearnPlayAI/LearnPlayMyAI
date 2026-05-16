#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_FILE="$SYSTEMD_USER_DIR/learnplay-local-apps-ensure.service"
TIMER_FILE="$SYSTEMD_USER_DIR/learnplay-local-apps-ensure.timer"

mkdir -p "$SYSTEMD_USER_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Ensure LearnPlay local cloud and on-prem apps are running

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
ExecStart=/bin/bash $APP_DIR/scripts/dev-workspace/local-apps.sh ensure all
KillMode=process
EOF

cat > "$TIMER_FILE" <<EOF
[Unit]
Description=Start and monitor LearnPlay local cloud and on-prem apps

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=10s
Unit=learnplay-local-apps-ensure.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now learnplay-local-apps-ensure.timer
systemctl --user start learnplay-local-apps-ensure.service

systemctl --user --no-pager status learnplay-local-apps-ensure.timer
