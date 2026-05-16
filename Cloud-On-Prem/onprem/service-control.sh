#!/usr/bin/env bash
set -euo pipefail

APP_NAME="learnplay"
APP_DIR="/opt/$APP_NAME"
LOG_FILE="/var/log/learnplay/admin.log"
HEALTH_TIMEOUT=30
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi
ENC_FILE="$APP_DIR/.env.enc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NEEDS_REENCRYPT=false

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [service] $*" | tee -a "$LOG_FILE"; }

get_app_port() {
  local APP_DIR="${LEARNPLAY_DIR:-/opt/learnplay}"
  local port=""
  if [ -f "$APP_DIR/.env" ]; then
    port=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  fi
  echo "${port:-3000}"
}

HEALTH_URL="http://127.0.0.1:$(get_app_port)/api/health"

ensure_env_for_pm2() {
  if [ -f "$ENV_FILE" ]; then
    NEEDS_REENCRYPT=false
    return 0
  fi

  if [ ! -f "$ENC_FILE" ]; then
    echo -e "${RED}❌ No .env or .env.enc found. Cannot start application.${NC}"
    log "No .env or .env.enc found"
    return 1
  fi

  echo -e "${YELLOW}🔐 Secrets are encrypted. Decrypting temporarily for app startup...${NC}"
  local secrets_script=""
  for candidate in "$SCRIPT_DIR/secrets-manager.sh" "$APP_DIR/scripts/secrets-manager.sh"; do
    if [ -f "$candidate" ]; then
      secrets_script="$candidate"
      break
    fi
  done

  if [ -z "$secrets_script" ]; then
    echo -e "${RED}❌ secrets-manager.sh not found. Cannot decrypt secrets.${NC}"
    log "secrets-manager.sh not found for auto-decrypt"
    return 1
  fi

  if bash "$secrets_script" decrypt; then
    NEEDS_REENCRYPT=true
    log "Auto-decrypted .env for PM2 startup"
  else
    echo -e "${RED}❌ Decryption failed. Cannot start application.${NC}"
    return 1
  fi
}

cleanup_env_after_start() {
  if [ "${NEEDS_REENCRYPT:-false}" = true ] && [ -f "$ENV_FILE" ]; then
    echo -e "${CYAN}🔐 Re-encrypting secrets...${NC}"
    local secrets_script=""
    for candidate in "$SCRIPT_DIR/secrets-manager.sh" "$APP_DIR/scripts/secrets-manager.sh"; do
      if [ -f "$candidate" ]; then
        secrets_script="$candidate"
        break
      fi
    done

    if [ -n "$secrets_script" ]; then
      if bash "$secrets_script" encrypt; then
        log "Auto-re-encrypted .env after PM2 startup"
        echo -e "${GREEN}✅ Secrets re-encrypted${NC}"
      else
        echo -e "${YELLOW}⚠️  Re-encryption failed. Plaintext .env remains on disk.${NC}"
        log "WARNING: Failed to re-encrypt .env after startup"
      fi
    fi
    NEEDS_REENCRYPT=false
  fi
}

print_header() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║      LearnPlay Service Control           ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

check_root() {
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ This script must be run as root (sudo)${NC}"
    exit 1
  fi
}

get_postgres_status() {
  if systemctl is-active --quiet postgresql 2>/dev/null; then
    local pid
    pid=$(systemctl show postgresql --property=MainPID --value 2>/dev/null || echo "")
    if [ -n "$pid" ] && [ "$pid" != "0" ]; then
      echo "running:$pid"
    else
      echo "running:"
    fi
  else
    echo "stopped:"
  fi
}

get_app_status() {
  local pm2_out
  if pm2_out=$(sudo -u "$APP_USER" pm2 describe "$APP_NAME" 2>/dev/null); then
    local status
    status=$(echo "$pm2_out" | grep -oP '│ status\s+│\s+\K\S+' 2>/dev/null || echo "")
    if [ "$status" = "online" ]; then
      local pid uptime mem restarts
      pid=$(echo "$pm2_out" | grep -oP '│ pid\s+│\s+\K\S+' 2>/dev/null || echo "")
      uptime=$(echo "$pm2_out" | grep -oP '│ uptime\s+│\s+\K[^│]+' 2>/dev/null | xargs || echo "")
      mem=$(echo "$pm2_out" | grep -oP '│ memory\s+│\s+\K[^│]+' 2>/dev/null | xargs || echo "")
      restarts=$(echo "$pm2_out" | grep -oP '│ unstable restarts\s+│\s+\K\S+' 2>/dev/null || echo "0")
      echo "running:$pid:$uptime:$mem:$restarts"
    elif [ "$status" = "stopped" ] || [ "$status" = "errored" ]; then
      echo "$status:"
    else
      echo "stopped:"
    fi
  else
    echo "stopped:"
  fi
}

get_nginx_status() {
  if systemctl is-active --quiet nginx 2>/dev/null; then
    local pid
    pid=$(systemctl show nginx --property=MainPID --value 2>/dev/null || echo "")
    if [ -n "$pid" ] && [ "$pid" != "0" ]; then
      echo "running:$pid"
    else
      echo "running:"
    fi
  else
    echo "stopped:"
  fi
}

print_service_status() {
  local label="$1"
  local status_str="$2"
  local state="${status_str%%:*}"

  case "$state" in
    running|online)
      echo -ne "  ${label}  ${GREEN}●${NC} Running"
      ;;
    stopped)
      echo -ne "  ${label}  ${RED}●${NC} Stopped"
      ;;
    errored)
      echo -ne "  ${label}  ${YELLOW}●${NC} Errored"
      ;;
    *)
      echo -ne "  ${label}  ${RED}●${NC} Unknown"
      ;;
  esac
}

print_postgres_status() {
  local status_str
  status_str=$(get_postgres_status)
  print_service_status "PostgreSQL:" "$status_str"
  local state="${status_str%%:*}"
  local pid="${status_str#*:}"
  if [ "$state" = "running" ] && [ -n "$pid" ]; then
    echo -e " (pid $pid)"
  else
    echo ""
  fi
}

print_app_status() {
  local status_str
  status_str=$(get_app_status)
  local state
  state=$(echo "$status_str" | cut -d: -f1)
  print_service_status "LearnPlay: " "$status_str"
  if [ "$state" = "running" ]; then
    local uptime mem restarts
    uptime=$(echo "$status_str" | cut -d: -f3)
    mem=$(echo "$status_str" | cut -d: -f4)
    restarts=$(echo "$status_str" | cut -d: -f5)
    local details=""
    [ -n "$uptime" ] && details="uptime: $uptime"
    [ -n "$mem" ] && details="${details:+$details, }mem: $mem"
    [ -n "$restarts" ] && [ "$restarts" != "0" ] && details="${details:+$details, }restarts: $restarts"
    if [ -n "$details" ]; then
      echo -e " ($details)"
    else
      echo ""
    fi
  else
    echo ""
  fi
}

print_nginx_status() {
  local status_str
  status_str=$(get_nginx_status)
  print_service_status "Nginx:     " "$status_str"
  local state="${status_str%%:*}"
  local pid="${status_str#*:}"
  if [ "$state" = "running" ] && [ -n "$pid" ]; then
    echo -e " (pid $pid)"
  else
    echo ""
  fi
}

print_all_status() {
  echo -e "${BOLD}Service Status:${NC}"
  print_postgres_status
  print_app_status
  print_nginx_status
}

run_health_check() {
  local response
  if response=$(curl -sf --max-time 5 "$HEALTH_URL" 2>/dev/null); then
    echo -e "${GREEN}✅ Healthy${NC}"
    return 0
  else
    echo -e "${RED}❌ Unhealthy${NC}"
    return 1
  fi
}

wait_for_health() {
  echo -ne "  Waiting for app to become healthy "
  local elapsed=0
  while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
    if curl -sf --max-time 2 "$HEALTH_URL" > /dev/null 2>&1; then
      echo ""
      log "Health check passed after ${elapsed}s"
      echo -e "  ${GREEN}✅ Application is healthy!${NC}"
      return 0
    fi
    echo -n "."
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo ""
  log "Health check failed after ${HEALTH_TIMEOUT}s"
  echo -e "  ${RED}❌ Application did not become healthy within ${HEALTH_TIMEOUT}s${NC}"
  echo -e "  ${YELLOW}Check logs: sudo -u $APP_USER pm2 logs $APP_NAME --lines 50${NC}"
  return 1
}

start_postgres() {
  local status_str
  status_str=$(get_postgres_status)
  local state="${status_str%%:*}"
  if [ "$state" = "running" ]; then
    echo -e "  ${YELLOW}PostgreSQL is already running${NC}"
    return 0
  fi
  log "Starting PostgreSQL..."
  echo -ne "  Starting PostgreSQL... "
  systemctl start postgresql
  sleep 2
  if systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}OK${NC}"
    log "PostgreSQL started"
  else
    echo -e "${RED}FAILED${NC}"
    log "PostgreSQL failed to start"
    return 1
  fi
}

stop_postgres() {
  local status_str
  status_str=$(get_postgres_status)
  local state="${status_str%%:*}"
  if [ "$state" = "stopped" ]; then
    echo -e "  ${YELLOW}PostgreSQL is already stopped${NC}"
    return 0
  fi
  log "Stopping PostgreSQL..."
  echo -ne "  Stopping PostgreSQL... "
  systemctl stop postgresql
  echo -e "${GREEN}OK${NC}"
  log "PostgreSQL stopped"
}

restart_postgres() {
  log "Restarting PostgreSQL..."
  echo -ne "  Restarting PostgreSQL... "
  systemctl restart postgresql
  sleep 2
  if systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}OK${NC}"
    log "PostgreSQL restarted"
  else
    echo -e "${RED}FAILED${NC}"
    log "PostgreSQL failed to restart"
    return 1
  fi
}

start_app() {
  local status_str
  status_str=$(get_app_status)
  local state
  state=$(echo "$status_str" | cut -d: -f1)
  if [ "$state" = "running" ]; then
    echo -e "  ${YELLOW}LearnPlay app is already running${NC}"
    return 0
  fi
  ensure_env_for_pm2 || return 1
  log "Starting LearnPlay app..."
  echo -ne "  Starting LearnPlay app... "
  sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.cjs" --silent 2>/dev/null
  echo -e "${GREEN}OK${NC}"
  log "LearnPlay app started"
  wait_for_health
  cleanup_env_after_start
}

stop_app() {
  local status_str
  status_str=$(get_app_status)
  local state
  state=$(echo "$status_str" | cut -d: -f1)
  if [ "$state" = "stopped" ]; then
    echo -e "  ${YELLOW}LearnPlay app is already stopped${NC}"
    return 0
  fi
  log "Stopping LearnPlay app..."
  echo -ne "  Stopping LearnPlay app... "
  sudo -u "$APP_USER" pm2 stop "$APP_NAME" --silent 2>/dev/null
  sleep 2
  echo -e "${GREEN}OK${NC}"
  log "LearnPlay app stopped"
}

restart_app() {
  local status_str
  status_str=$(get_app_status)
  local state
  state=$(echo "$status_str" | cut -d: -f1)
  if [ "$state" = "running" ]; then
    ensure_env_for_pm2 || return 1
    log "Restarting LearnPlay app..."
    echo -ne "  Restarting LearnPlay app... "
    sudo -u "$APP_USER" pm2 restart "$APP_NAME" --silent 2>/dev/null
    echo -e "${GREEN}OK${NC}"
    log "LearnPlay app restarted"
  else
    start_app
    return
  fi
  wait_for_health
  cleanup_env_after_start
}

start_nginx() {
  local status_str
  status_str=$(get_nginx_status)
  local state="${status_str%%:*}"
  if [ "$state" = "running" ]; then
    echo -e "  ${YELLOW}Nginx is already running${NC}"
    return 0
  fi
  log "Starting Nginx..."
  echo -ne "  Starting Nginx... "
  systemctl start nginx
  if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}OK${NC}"
    log "Nginx started"
  else
    echo -e "${RED}FAILED${NC}"
    log "Nginx failed to start"
    return 1
  fi
}

stop_nginx() {
  local status_str
  status_str=$(get_nginx_status)
  local state="${status_str%%:*}"
  if [ "$state" = "stopped" ]; then
    echo -e "  ${YELLOW}Nginx is already stopped${NC}"
    return 0
  fi
  log "Stopping Nginx..."
  echo -ne "  Stopping Nginx... "
  systemctl stop nginx
  echo -e "${GREEN}OK${NC}"
  log "Nginx stopped"
}

restart_nginx() {
  log "Restarting Nginx..."
  echo -ne "  Restarting Nginx... "
  systemctl restart nginx
  if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}OK${NC}"
    log "Nginx restarted"
  else
    echo -e "${RED}FAILED${NC}"
    log "Nginx failed to restart"
    return 1
  fi
}

start_all() {
  echo -e "${BOLD}Starting all services...${NC}"
  log "Starting all services"
  start_postgres
  start_app
  start_nginx
  echo ""
  echo -e "${GREEN}All services started.${NC}"
  log "All services started"
}

stop_all() {
  echo -e "${BOLD}Stopping all services...${NC}"
  log "Stopping all services"
  stop_nginx
  stop_app
  stop_postgres
  echo ""
  echo -e "${GREEN}All services stopped.${NC}"
  log "All services stopped"
}

restart_all() {
  echo -e "${BOLD}Restarting all services...${NC}"
  log "Restarting all services"
  stop_all
  echo ""
  start_all
}

status_all() {
  print_all_status
  echo ""
  echo -ne "${BOLD}Health Check:  ${NC}"
  run_health_check || true
}

status_service() {
  local svc="$1"
  case "$svc" in
    postgres|postgresql)
      print_postgres_status
      ;;
    app|learnplay)
      print_app_status
      ;;
    nginx)
      print_nginx_status
      ;;
    *)
      echo -e "${RED}Unknown service: $svc${NC}"
      echo "  Valid services: postgres, app, nginx"
      return 1
      ;;
  esac
}

start_service() {
  local svc="$1"
  case "$svc" in
    postgres|postgresql) start_postgres ;;
    app|learnplay) start_app ;;
    nginx) start_nginx ;;
    *)
      echo -e "${RED}Unknown service: $svc${NC}"
      echo "  Valid services: postgres, app, nginx"
      return 1
      ;;
  esac
}

stop_service() {
  local svc="$1"
  case "$svc" in
    postgres|postgresql) stop_postgres ;;
    app|learnplay) stop_app ;;
    nginx) stop_nginx ;;
    *)
      echo -e "${RED}Unknown service: $svc${NC}"
      echo "  Valid services: postgres, app, nginx"
      return 1
      ;;
  esac
}

restart_service() {
  local svc="$1"
  case "$svc" in
    postgres|postgresql) restart_postgres ;;
    app|learnplay) restart_app ;;
    nginx) restart_nginx ;;
    *)
      echo -e "${RED}Unknown service: $svc${NC}"
      echo "  Valid services: postgres, app, nginx"
      return 1
      ;;
  esac
}

show_logs() {
  echo -e "${BOLD}Recent PM2 Logs:${NC}"
  echo ""
  sudo -u "$APP_USER" pm2 logs "$APP_NAME" --lines 50 --nostream 2>/dev/null || echo -e "${YELLOW}No logs available${NC}"
}

prompt_service() {
  echo ""
  echo "  Select service:"
  echo "    1) PostgreSQL"
  echo "    2) LearnPlay App"
  echo "    3) Nginx"
  echo ""
  read -rp "  Select [1-3]: " svc_choice
  case "$svc_choice" in
    1) echo "postgres" ;;
    2) echo "app" ;;
    3) echo "nginx" ;;
    *) echo "" ;;
  esac
}

interactive_menu() {
  while true; do
    print_header

    print_all_status
    echo ""
    echo -ne "${BOLD}Health Check:  ${NC}"
    run_health_check || true

    echo ""
    echo "  1) Start All Services"
    echo "  2) Stop All Services"
    echo "  3) Restart All Services"
    echo "  4) Start Individual Service"
    echo "  5) Stop Individual Service"
    echo "  6) Restart Individual Service"
    echo "  7) View Application Logs"
    echo "  8) Run Health Check"
    echo "  9) Back / Exit"
    echo ""
    read -rp "Select option [1-9]: " choice

    echo ""
    case "$choice" in
      1) start_all ;;
      2) stop_all ;;
      3) restart_all ;;
      4)
        svc=$(prompt_service)
        if [ -n "$svc" ]; then
          start_service "$svc"
        else
          echo -e "${RED}Invalid selection${NC}"
        fi
        ;;
      5)
        svc=$(prompt_service)
        if [ -n "$svc" ]; then
          stop_service "$svc"
        else
          echo -e "${RED}Invalid selection${NC}"
        fi
        ;;
      6)
        svc=$(prompt_service)
        if [ -n "$svc" ]; then
          restart_service "$svc"
        else
          echo -e "${RED}Invalid selection${NC}"
        fi
        ;;
      7) show_logs ;;
      8)
        echo -ne "${BOLD}Health Check:  ${NC}"
        run_health_check || true
        ;;
      9)
        echo -e "${CYAN}Goodbye!${NC}"
        exit 0
        ;;
      *)
        echo -e "${RED}Invalid option${NC}"
        ;;
    esac

    echo ""
    read -rp "Press Enter to continue..." _
  done
}

show_usage() {
  echo "Usage: $0 {start|stop|restart|status|health|logs} [service]"
  echo ""
  echo "Commands:"
  echo "  start   [service]   Start all services or a specific service"
  echo "  stop    [service]   Stop all services or a specific service"
  echo "  restart [service]   Restart all services or a specific service"
  echo "  status  [service]   Show status of all or a specific service"
  echo "  health              Run application health check"
  echo "  logs                Show recent PM2 application logs"
  echo ""
  echo "Services: postgres, app, nginx"
  echo ""
  echo "Run without arguments for interactive menu."
}

check_root

if [ $# -eq 0 ]; then
  interactive_menu
  exit 0
fi

COMMAND="${1:-}"
SERVICE="${2:-}"

case "$COMMAND" in
  start)
    if [ -n "$SERVICE" ]; then
      start_service "$SERVICE"
    else
      start_all
    fi
    ;;
  stop)
    if [ -n "$SERVICE" ]; then
      stop_service "$SERVICE"
    else
      stop_all
    fi
    ;;
  restart)
    if [ -n "$SERVICE" ]; then
      restart_service "$SERVICE"
    else
      restart_all
    fi
    ;;
  status)
    if [ -n "$SERVICE" ]; then
      status_service "$SERVICE"
    else
      status_all
    fi
    ;;
  health)
    echo -ne "${BOLD}Health Check:  ${NC}"
    run_health_check
    ;;
  logs)
    show_logs
    ;;
  help|--help|-h)
    show_usage
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}"
    echo ""
    show_usage
    exit 1
    ;;
esac
