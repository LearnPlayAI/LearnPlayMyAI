#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/learnplay-perf-tune.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

APP_DIR="/opt/learnplay"
ENV_FILE="$APP_DIR/.env"
APP_USER="$(grep -E '^LP_ADMIN_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
if [ -z "$APP_USER" ]; then
  APP_USER="${SUDO_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"
fi

echo "============================================"
echo "  LearnPlay Performance Tuning"
echo "============================================"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

# ============================================
# Hardware Detection
# ============================================
TOTAL_CPU=$(nproc)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
TOTAL_RAM_GB=$((TOTAL_RAM_MB / 1024))

log "📊 Hardware Detected:"
log "   CPUs:   $TOTAL_CPU cores"
log "   RAM:    ${TOTAL_RAM_MB} MB (${TOTAL_RAM_GB} GB)"
log "   Disk:   $(df -h / | awk 'NR==2{print $2}') total, $(df -h / | awk 'NR==2{print $4}') free"
log ""

# ============================================
# Layer 1: OS Performance Tuning
# ============================================
log "⚡ Layer 1: OS Performance Tuning"
log "─────────────────────────────────"

cat > /etc/sysctl.d/99-learnplay-performance.conf << EOF
# ==========================================
# LearnPlay OS Performance Tuning
# Auto-configured for ${TOTAL_RAM_GB}GB RAM, ${TOTAL_CPU} CPUs
# ==========================================

# Virtual Memory
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
vm.overcommit_memory = 0

# File System
fs.file-max = $((TOTAL_RAM_MB * 256))
fs.inotify.max_user_watches = 524288

# Network - TCP Performance
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 87380 16777216
net.ipv4.tcp_max_tw_buckets = 1440000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.ip_local_port_range = 10000 65535

# Shared Memory (for PostgreSQL)
kernel.shmmax = $((TOTAL_RAM_KB * 1024 / 2))
kernel.shmall = $((TOTAL_RAM_KB * 1024 / 2 / 4096))
EOF

sysctl -p /etc/sysctl.d/99-learnplay-performance.conf > /dev/null 2>&1

# Increase file descriptor limits for app user
cat > /etc/security/limits.d/learnplay.conf << EOF
$APP_USER soft nofile 65535
$APP_USER hard nofile 65535
$APP_USER soft nproc 65535
$APP_USER hard nproc 65535
EOF

log "   ✅ vm.swappiness = 10 (minimize swapping)"
log "   ✅ vm.dirty_ratio = 15 (optimize write-back)"
log "   ✅ fs.file-max = $((TOTAL_RAM_MB * 256))"
log "   ✅ TCP tuning applied"
log "   ✅ File descriptor limits: 65535"
log ""

# ============================================
# Layer 2: PostgreSQL Performance Tuning
# ============================================
log "⚡ Layer 2: PostgreSQL Performance Tuning"
log "──────────────────────────────────────────"

# Calculate PostgreSQL settings based on available RAM
# Follows PostgreSQL best practices:
# shared_buffers = 25% of RAM (max 8GB)
# effective_cache_size = 75% of RAM
# work_mem = RAM / max_connections / 4
# maintenance_work_mem = RAM / 16 (max 2GB)

SHARED_BUFFERS_MB=$((TOTAL_RAM_MB / 4))
[ $SHARED_BUFFERS_MB -gt 8192 ] && SHARED_BUFFERS_MB=8192

EFFECTIVE_CACHE_SIZE_MB=$((TOTAL_RAM_MB * 3 / 4))

MAX_CONNECTIONS=100
WORK_MEM_MB=$((TOTAL_RAM_MB / MAX_CONNECTIONS / 4))
[ $WORK_MEM_MB -lt 4 ] && WORK_MEM_MB=4

MAINTENANCE_WORK_MEM_MB=$((TOTAL_RAM_MB / 16))
[ $MAINTENANCE_WORK_MEM_MB -gt 2048 ] && MAINTENANCE_WORK_MEM_MB=2048
[ $MAINTENANCE_WORK_MEM_MB -lt 64 ] && MAINTENANCE_WORK_MEM_MB=64

# WAL settings
WAL_BUFFERS_MB=64
[ $TOTAL_RAM_MB -lt 4096 ] && WAL_BUFFERS_MB=16

# Parallel query workers (leave 1 CPU for OS, 1 for Node.js)
MAX_PARALLEL_WORKERS=$((TOTAL_CPU - 2))
[ $MAX_PARALLEL_WORKERS -lt 0 ] && MAX_PARALLEL_WORKERS=0
MAX_PARALLEL_WORKERS_PER_GATHER=$((MAX_PARALLEL_WORKERS / 2))
[ $MAX_PARALLEL_WORKERS_PER_GATHER -lt 0 ] && MAX_PARALLEL_WORKERS_PER_GATHER=0

PG_CONF=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
if [ -z "$PG_CONF" ]; then
  log "   ⚠️  postgresql.conf not found, skipping PostgreSQL tuning"
else
  # Create a tuning override file
  PG_CONF_DIR=$(dirname "$PG_CONF")
  mkdir -p "$PG_CONF_DIR/conf.d"
  
  cat > "$PG_CONF_DIR/conf.d/learnplay-tuning.conf" << EOF
# ==========================================
# LearnPlay PostgreSQL Performance Tuning
# Auto-configured for ${TOTAL_RAM_GB}GB RAM, ${TOTAL_CPU} CPUs
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ==========================================

# Memory
shared_buffers = ${SHARED_BUFFERS_MB}MB
effective_cache_size = ${EFFECTIVE_CACHE_SIZE_MB}MB
work_mem = ${WORK_MEM_MB}MB
maintenance_work_mem = ${MAINTENANCE_WORK_MEM_MB}MB

# Connections
max_connections = ${MAX_CONNECTIONS}

# WAL
wal_buffers = ${WAL_BUFFERS_MB}MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min

# Parallel Query
max_parallel_workers = ${MAX_PARALLEL_WORKERS}
max_parallel_workers_per_gather = ${MAX_PARALLEL_WORKERS_PER_GATHER}
max_parallel_maintenance_workers = ${MAX_PARALLEL_WORKERS_PER_GATHER}
max_worker_processes = $((MAX_PARALLEL_WORKERS + 4))

# Planner
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 100

# Logging (performance related)
log_min_duration_statement = 1000
EOF

  # Ensure conf.d is included (idempotent check)
  if ! grep -q "include_dir = 'conf.d'" "$PG_CONF"; then
    echo "include_dir = 'conf.d'" >> "$PG_CONF"
  fi

  # Restart PostgreSQL to apply changes
  if systemctl is-active --quiet postgresql; then
    systemctl restart postgresql
  fi

  log "   ✅ shared_buffers = ${SHARED_BUFFERS_MB}MB (25% of RAM)"
  log "   ✅ effective_cache_size = ${EFFECTIVE_CACHE_SIZE_MB}MB (75% of RAM)"
  log "   ✅ work_mem = ${WORK_MEM_MB}MB"
  log "   ✅ maintenance_work_mem = ${MAINTENANCE_WORK_MEM_MB}MB"
  log "   ✅ max_connections = ${MAX_CONNECTIONS}"
  log "   ✅ WAL: min=1GB, max=4GB, buffers=${WAL_BUFFERS_MB}MB"
  log "   ✅ Parallel workers = ${MAX_PARALLEL_WORKERS}"
  log "   ✅ Checkpoints: target=0.9, timeout=15min"
fi
log ""

# ============================================
# Layer 3: Application Performance Tuning
# ============================================
log "⚡ Layer 3: Application Performance Tuning"
log "───────────────────────────────────────────"

# Node.js memory (60% of remaining RAM after PostgreSQL)
PG_RAM_MB=$SHARED_BUFFERS_MB
REMAINING_RAM_MB=$((TOTAL_RAM_MB - PG_RAM_MB - 512))  # 512MB for OS
NODE_MAX_OLD_SPACE=$((REMAINING_RAM_MB * 60 / 100))
[ $NODE_MAX_OLD_SPACE -lt 512 ] && NODE_MAX_OLD_SPACE=512
[ $NODE_MAX_OLD_SPACE -gt 8192 ] && NODE_MAX_OLD_SPACE=8192

# PM2 instances — keep at 1 for socket.io compatibility
PM2_INSTANCES=1

# DB connection pool size (should be less than max_connections, leaving room for admin connections)
DB_POOL_MAX=$((MAX_CONNECTIONS - 20))
[ $DB_POOL_MAX -gt 50 ] && DB_POOL_MAX=50
[ $DB_POOL_MAX -lt 10 ] && DB_POOL_MAX=10

DB_POOL_MIN=$((DB_POOL_MAX / 5))
[ $DB_POOL_MIN -lt 2 ] && DB_POOL_MIN=2

# Update ecosystem.config.cjs if it exists
ECO_CONFIG="/opt/learnplay/ecosystem.config.cjs"
if [ -f "$ECO_CONFIG" ]; then
  log "   Updating PM2 configuration..."
  # Update max-old-space-size in the node_args (idempotent with sed)
  sed -i "s/--max-old-space-size=[0-9]*[MB]*\([ }\`]\)/--max-old-space-size=$NODE_MAX_OLD_SPACE\1/" "$ECO_CONFIG" 2>/dev/null || true
  log "   ✅ PM2 config updated"
fi

# Update .env if it exists (add/update pool settings)
ENV_FILE="/opt/learnplay/.env"
if [ -f "$ENV_FILE" ]; then
  log "   Updating application environment..."
  
  # Update or add each setting (idempotent)
  for SETTING in "MAX_OLD_SPACE_SIZE=$NODE_MAX_OLD_SPACE" "ENABLE_OPTIMIZED_POOL=true" "DB_POOL_MAX=$DB_POOL_MAX" "DB_POOL_MIN=$DB_POOL_MIN"; do
    KEY="${SETTING%%=*}"
    VALUE="${SETTING#*=}"
    if grep -q "^${KEY}=" "$ENV_FILE"; then
      sed -i "s/^${KEY}=.*/${KEY}=${VALUE}/" "$ENV_FILE"
    else
      echo "${KEY}=${VALUE}" >> "$ENV_FILE"
    fi
  done
  
  log "   ✅ .env updated with performance settings"
fi

# Save tuning parameters for later use by app-install.sh
cat > /tmp/learnplay-perf-settings << EOF
NODE_MAX_OLD_SPACE=$NODE_MAX_OLD_SPACE
PM2_INSTANCES=$PM2_INSTANCES
DB_POOL_MAX=$DB_POOL_MAX
DB_POOL_MIN=$DB_POOL_MIN
MAX_CONNECTIONS=$MAX_CONNECTIONS
EOF
chmod 600 /tmp/learnplay-perf-settings

log "   ✅ Node.js max-old-space-size = ${NODE_MAX_OLD_SPACE}MB"
log "   ✅ PM2 instances = ${PM2_INSTANCES} (single instance for WebSocket compatibility)"
log "   ✅ DB pool: max=${DB_POOL_MAX}, min=${DB_POOL_MIN}"
log "   ℹ️  Note: PM2 cluster mode requires sticky sessions for socket.io"
log "        Keep instances=1 unless you configure a sticky session load balancer"
log ""

# ============================================
# Summary
# ============================================
log "============================================"
log "  ✅ Performance Tuning Complete"
log "============================================"
log ""
log "PERFORMANCE SUMMARY"
log "─────────────────────────────────────────"
log ""
log "Hardware: ${TOTAL_CPU} CPUs, ${TOTAL_RAM_GB}GB RAM"
log ""
log "OS Layer:"
log "  vm.swappiness = 10"
log "  fs.file-max = $((TOTAL_RAM_MB * 256))"
log "  TCP optimized for high throughput"
log ""
log "PostgreSQL:"
log "  shared_buffers = ${SHARED_BUFFERS_MB}MB (25% of RAM)"
log "  effective_cache = ${EFFECTIVE_CACHE_SIZE_MB}MB (75% of RAM)"
log "  work_mem = ${WORK_MEM_MB}MB"
log "  max_connections = ${MAX_CONNECTIONS}"
log "  parallel workers = ${MAX_PARALLEL_WORKERS}"
log ""
log "Application:"
log "  Node.js heap = ${NODE_MAX_OLD_SPACE}MB"
log "  PM2 instances = ${PM2_INSTANCES} (WebSocket safe)"
log "  DB pool = ${DB_POOL_MIN}-${DB_POOL_MAX} connections"
log ""
log "Settings saved to /tmp/learnplay-perf-settings"
log ""
log "Next step: Run app-install.sh"
log ""
