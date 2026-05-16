# Load Testing with k6

This directory contains k6 load testing scripts for establishing performance baselines.

## Prerequisites

Install k6:
```bash
# macOS (via Homebrew)
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows (via Chocolatey)
choco install k6
```

If `k6` is not globally installed on the host, use the wrapper:
`bash tests/load/run-k6.sh ...`

## Cost-Safe Load Policy

These load tests are application-focused and must avoid expensive AI/provider workflows.

Excluded from load runs:
- `/api/ai/*`
- Course/lesson AI generation or regeneration routes
- Podcast generation/translation routes
- Provider model/balance/test integration routes
- Payment/webhook and import/export mutation paths

## Running Tests

### 0) Seed deterministic load users (DEV only)
```bash
# Cloud dev runtime data
bash scripts/load/seed-load-users.sh --variant cloud --count 2600

# Onprem dev runtime data
bash scripts/load/seed-load-users.sh --variant onprem --count 2600
```

### Baseline Test
```bash
# Run against local development server
bash tests/load/run-k6.sh run tests/load/k6-baseline.js

# Run against specific URL
bash tests/load/run-k6.sh run --env BASE_URL=https://your-app.replit.app tests/load/k6-baseline.js
```

### 2000 Concurrent Application Mix
```bash
# Cloud
bash tests/load/run-k6.sh run \
  --env BASE_URL=https://stcloud.learnplay.co.za \
  --env VARIANT=cloud \
  --env USER_CSV=data/users-cloud.csv \
  tests/load/k6-app-2000.js

# Onprem
bash tests/load/run-k6.sh run \
  --env BASE_URL=https://stonprem.learnplay.co.za \
  --env VARIANT=onprem \
  --env USER_CSV=data/users-onprem.csv \
  tests/load/k6-app-2000.js
```

### Short Iteration Profile (Wave-Friendly)
Use `LOAD_PROFILE=short` for fast app-layer checks during remediation loops.  
Default behavior remains the full 2000-concurrency profile when `LOAD_PROFILE` is not set.

```bash
# Cloud short profile
bash tests/load/run-k6.sh run \
  --env LOAD_PROFILE=short \
  --env BASE_URL=https://stcloud.learnplay.co.za \
  --env VARIANT=cloud \
  --env USER_CSV=data/users-cloud.csv \
  tests/load/k6-app-2000.js

# Onprem short profile
bash tests/load/run-k6.sh run \
  --env LOAD_PROFILE=short \
  --env BASE_URL=https://stonprem.learnplay.co.za \
  --env VARIANT=onprem \
  --env USER_CSV=data/users-onprem.csv \
  tests/load/k6-app-2000.js
```

### DEV Certificate + Onprem Policy Overrides
- `K6_INSECURE_TLS=true` enables `insecureSkipTLSVerify` for DEV environments with non-SAN certs.
- `ONPREM_SYSTEM_TYPE=development|acceptance|production` controls expected learner-login policy during onprem runs.
  - For non-production onprem, learner (`student`) 403 login responses are treated as expected policy behavior.

## Test Scenarios

### k6-baseline.js
- Simulates gradual ramp-up to 100 concurrent users
- Tests public endpoints (leaderboard, server time, etc.)
- Tests authentication flow
- Measures response times and error rates

### k6-app-2000.js
- Ramps to 2000 concurrent users with mixed role-based app endpoints.
- Uses seeded credential CSV files.
- Targets app-level reliability issues rather than hardware or AI-provider limits.

### Metrics Tracked
- **http_req_duration**
  - default profile gate: `p(95) < 1500ms`
  - short profile gate: `p(95) < 30000ms` (functional dev-wave tolerance)
- **errors**
  - default profile gate: `<1%`
  - short profile gate: `<5%`
- **http_req_failed**
  - default profile gate: `<2%`
  - short profile gate: `<5%`
- **http_reqs**: Total requests per second
- **iteration_duration**: Full test iteration time

## Interpreting Results

Look for:
1. **P95 latency** - Use profile-specific gates (`1500ms` default, `30000ms` short).
2. **Error rate** - Use profile-specific gates (`errors` and `http_req_failed`).
3. **5xx bursts** - No sustained 5xx patterns across role journeys.
4. **Connection pool utilization** - Check server logs for saturation patterns.

## Next Steps

After establishing baseline:
1. Run load test before optimizations
2. Implement Phase 1 optimizations (connection pooling, indexes)
3. Run load test again
4. Compare metrics to measure improvement
5. Repeat for Phase 2 and Phase 3
