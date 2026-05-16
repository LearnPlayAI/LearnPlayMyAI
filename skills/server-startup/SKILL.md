---
name: server-startup
description: Start, restart, and stop dev environment servers (cloud and onprem). Use when the user asks to start, restart, or stop the dev cloud or dev onprem server. Accepts natural language instructions like "start dev cloud", "restart onprem", "stop cloud", or just "start cloud". Checks database connectivity, detects code changes, and builds if needed before starting.
---

# Server Startup Skill

## Purpose

Manage the lifecycle of LearnPlay dev environment servers (cloud and onprem). This skill enables Cline to:

1. Check if the PostgreSQL database is running and reachable
2. Check if the server is already running on the target port
3. Detect uncommitted code changes and build if needed
4. Start, restart, or stop the dev server gracefully
5. Present 3 clickable options: Restart, Start, Stop

## Trigger Examples

- "start dev cloud" → Start the dev cloud server
- "start cloud" → Start the dev cloud server (defaults to cloud)
- "start dev onprem" → Start the dev onprem server
- "start onprem" → Start the dev onprem server (defaults to onprem)
- "restart dev cloud" → Restart the dev cloud server
- "restart cloud" → Restart the dev cloud server
- "stop dev cloud" → Stop the dev cloud server
- "stop cloud" → Stop the dev cloud server
- "is cloud running" → Check if the dev cloud server is running

## Environment Configuration

| Keyword | Port | DB Name | Env File | PID File |
|---------|------|---------|----------|----------|
| `dev cloud` / `cloud` | 5000 | `learnplay_cloud` | `.env.cloud` | `.server-cloud.pid` |
| `dev onprem` / `onprem` | 5001 | `learnplay_onprem` | `.env.onprem` | `.server-onprem.pid` |

For full database connection details, see `references/env-config.md`.

## Core Workflow

### Step 1: Parse the Request

Extract from user input:
- **Environment**: `cloud` or `onprem` (default: `cloud` if ambiguous)
- **Action**: `start`, `restart`, or `stop`

Resolution logic:
1. If user says "start" alone with no environment → ASK which environment
2. If user says "start cloud" → env=`cloud`, action=`start`
3. If user says "restart onprem" → env=`onprem`, action=`restart`
4. If user says "stop dev cloud" → env=`cloud`, action=`stop`
5. If user says "is cloud running" / "check cloud" → env=`cloud`, action=`status`

### Step 2: Check Server Status

Check if the server process is already running on the target port:

```bash
# Check if port is in use and get PID
fuser 5000/tcp 2>/dev/null   # cloud
fuser 5001/tcp 2>/dev/null   # onprem

# Or check PID file
cat Cloud-On-Prem/.server-<env>.pid 2>/dev/null
```

Determine if server is running:
- If port is active AND PID file exists → server is running
- If neither → server is NOT running
- If PID file exists but port is free → stale PID, treat as NOT running

### Step 3: Check Database Connectivity

Check if PostgreSQL is reachable:

```bash
PGPASSWORD=learnplay_dev_secret psql -h localhost -U learnplay -d learnplay_cloud -c "SELECT 1" -q 2>/dev/null   # cloud
PGPASSWORD=learnplay_dev_secret psql -h localhost -U learnplay -d learnplay_onprem -c "SELECT 1" -q 2>/dev/null  # onprem
```

Expected result: `1` (no errors)

**If database is NOT reachable:**
```
Database is not reachable on localhost:5432.
Target database: learnplay_cloud

Please start PostgreSQL and try again.
```

**If database IS reachable:** proceed to next step.

### Step 4: Check for Code Changes (Start/Restart Only)

For `start` and `restart` actions, check if code has changed since last build:

```bash
cd Cloud-On-Prem
CHANGES=$(git diff HEAD -- client/src/ shared/ 2>/dev/null)
UNTRACKED=$(git ls-files --others --exclude-standard client/src/ shared/ 2>/dev/null)

if [ -n "$CHANGES" ] || [ -n "$UNTRACKED" ]; then
  echo "CODE_CHANGES_DETECTED"
else
  echo "NO_CHANGES"
fi
```

**If changes detected:** Build first before starting:
```bash
cd Cloud-On-Prem
npm run build
echo "Build completed. Changes will be reflected."
```

### Step 5: Execute Action

#### Action: START

```bash
cd Cloud-On-Prem
cp .env.<env> .env
TSX_DISABLE_IPC=1 NODE_ENV=development tsx server/index.ts > "logs/learnplay-dev-<env>.log" 2>&1 &
echo $! > Cloud-On-Prem/.server-<env>.pid
```

Wait for server to be ready:
```bash
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:<port> 2>/dev/null)
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ]; then
    echo "Server is ready"
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
```

#### Action: RESTART

1. STOP the existing server (graceful)
2. Check for code changes → build if needed
3. START the new server

#### Action: STOP

```bash
PID=$(cat Cloud-On-Prem/.server-<env>.pid 2>/dev/null)
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID"
  # Wait for graceful shutdown
  TIMEOUT=30
  ELAPSED=0
  while kill -0 "$PID" 2>/dev/null && [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 1
    ELAPSED=$((ELAPSED + 1))
  done
  # Force kill if still running
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID"
  fi
  rm -f Cloud-On-Prem/.server-<env>.pid
fi
```

### Step 6: Present Status and Options

After executing the action, present the status and 3 clickable options:

**When server IS running:**
```
✅ Dev Cloud server is running on http://localhost:5000
   Database: learnplay_cloud (connected)
   PID: 12345
   Uptime: 5 minutes

   Options:
   1. 🔁 Restart — Stop and start the server
   2. ▶️ Start — Already running (no action needed)
   3. ⏹️ Stop — Gracefully stop the server
```

**When server is NOT running:**
```
⚠️ Dev Cloud server is NOT running on http://localhost:5000
   Database: learnplay_cloud (connected)

   Options:
   1. 🔁 Restart — Build (if needed) and start the server
   2. ▶️ Start — Start the server
   3. ⏹️ Stop — Already stopped
```

**When database is NOT reachable:**
```
❌ Database is NOT reachable on localhost:5432
   Target: learnplay_cloud

   The server cannot start until PostgreSQL is running.

   Options:
   1. 🔁 Restart — Check DB and restart server
   2. ▶️ Start — Attempt to start server (will fail without DB)
   3. ⏹️ Stop — Stop any running server processes
```

## Option Handling

When the user selects an option, execute the corresponding action:

| Option | Action |
|--------|--------|
| **Restart** | Stop server → Check code changes → Build if needed → Start server → Verify |
| **Start** | Check code changes → Build if needed → Start server → Verify |
| **Stop** | Send SIGTERM → Wait for graceful shutdown → Remove PID file |

## Code Change Build Policy

**Always build before starting/restarting if:**
- `client/src/` has uncommitted changes
- `shared/` has uncommitted changes
- `client/src/` has new untracked files
- `shared/` has new untracked files

**Build command:**
```bash
cd Cloud-On-Prem
npm run build
```

**Build output:** The build compiles TypeScript and bundles the server with esbuild. The dev server (`npm run dev` / `tsx`) does NOT use the build output — it runs TypeScript directly. However, if the user has previously run a build, stale artifacts may cause issues, so clean before building:

```bash
cd Cloud-On-Prem
rm -rf dist/
npm run build
```

## Graceful Shutdown

When stopping a server:

1. **Send SIGTERM** — Allows the server to finish current requests and clean up
2. **Wait up to 30 seconds** — Poll the PID to see if it exits
3. **Force kill with SIGKILL** — Only if the process is still running after timeout
4. **Clean up PID file** — Remove the `.server-<env>.pid` file

## Error Handling

### Server fails to start within 120 seconds
```
❌ Dev Cloud server failed to start within 120 seconds.

Check the logs:
  cat Cloud-On-Prem/logs/learnplay-dev-cloud.log

Common issues:
- Database not reachable
- Port 5000 already in use
- Missing environment variables
- Build errors
```

### Port already in use
```
❌ Port 5000 is already in use by another process.

PID on port: <pid>
Kill it with: kill -9 <pid>

Or use a different port by setting PORT environment variable.
```

### Build fails
```
❌ Build failed with errors. Check the output above for details.

Fix the errors and try again.
```

## Important Notes

- **ONLY dev environments** — This skill only supports `dev cloud` and `dev onprem`
- **NEVER** use this skill for acc/prd environments — those are managed by deployment scripts
- **Always check database first** — The server cannot function without database connectivity
- **Always build before start/restart if code changed** — Ensures latest changes are reflected
- **PID files are managed automatically** — Do not manually edit `.server-<env>.pid` files
- **Logs are written to `Cloud-On-Prem/logs/learnplay-dev-<env>.log`** — Check these for troubleshooting
- **Graceful shutdown preferred** — Always use SIGTERM before SIGKILL
- **The .env file is overwritten on each start** — `cp .env.<env> .env` ensures correct config