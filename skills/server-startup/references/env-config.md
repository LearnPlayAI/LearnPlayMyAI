---
name: env-config
description: Database connection details and environment configuration for dev cloud and dev onprem servers.
---

# Environment Configuration Reference

## Dev Cloud

| Setting | Value |
|---------|-------|
| **Port** | 5000 |
| **URL** | http://localhost:5000 |
| **Database Name** | learnplay_cloud |
| **Database Host** | localhost |
| **Database Port** | 5432 |
| **Database User** | learnplay |
| **Database Password** | learnplay_dev_secret |
| **DATABASE_URL** | `postgresql://learnplay:learnplay_dev_secret@localhost:5432/learnplay_cloud` |
| **Env File** | `.env.cloud` |
| **PID File** | `.server-cloud.pid` |
| **Log File** | `logs/learnplay-dev-cloud.log` |
| **DEPLOYMENT_MODE** | cloud |
| **ONPREM_MODE** | false |

### Connection Test
```bash
PGPASSWORD=learnplay_dev_secret psql -h localhost -U learnplay -d learnplay_cloud -c "SELECT 1" -q
```

## Dev OnPrem

| Setting | Value |
|---------|-------|
| **Port** | 5001 |
| **URL** | http://localhost:5001 |
| **Database Name** | learnplay_onprem |
| **Database Host** | localhost |
| **Database Port** | 5432 |
| **Database User** | learnplay |
| **Database Password** | learnplay_dev_secret |
| **DATABASE_URL** | `postgresql://learnplay:learnplay_dev_secret@localhost:5432/learnplay_onprem` |
| **Env File** | `.env.onprem` |
| **PID File** | `.server-onprem.pid` |
| **Log File** | `logs/learnplay-dev-onprem.log` |
| **DEPLOYMENT_MODE** | onprem |
| **ONPREM_MODE** | true |

### Connection Test
```bash
PGPASSWORD=learnplay_dev_secret psql -h localhost -U learnplay -d learnplay_onprem -c "SELECT 1" -q
```

## Common Settings

### Admin Credentials
Both environments share the same admin credentials (seeded into database):

| Setting | Value |
|---------|-------|
| **Email** | demo@learnplay.co.za |
| **Gamer Name** | demo-user |
| **Password** | DevPlatform@1 |

### Feature Flags
Both environments have the same default feature flags:

| Flag | Value |
|------|-------|
| CF_V2_SEGMENTS_ENABLED | false |
| CF_V2_NO_FRAMEWORK_GENERATION | false |
| CF_V2_NO_SUMMARIZATION | false |
| CF_V2_ASSIGNMENT_ENFORCED | false |
| CF_V2_FINALIZE_COVERAGE_GATE | false |
| ENABLE_MULTI_ORG_SWITCHING | true |
| COURSE_VISIBILITY_ENABLED | false |
| ENABLE_AI_THUMBNAILS | false |
| FRESH_INSTALL | true |

### Server Configuration
| Setting | Value |
|---------|-------|
| **NODE_ENV** | development |
| **SESSION_SECRET** | Different per environment (see .env files) |
| **COOKIE_SECURE** | false |
| **TRUST_PROXY** | false |
| **SSL_MODE** | off |
| **UPLOAD_DIR** | ./uploads |
| **TIMEZONE** | Africa/Johannesburg |
| **CURRENCY** | ZAR |

## Server Startup Command

### Dev Cloud
```bash
cd Cloud-On-Prem && cp .env.cloud .env && TSX_DISABLE_IPC=1 NODE_ENV=development tsx server/index.ts
```

### Dev OnPrem
```bash
cd Cloud-On-Prem && cp .env.onprem .env && TSX_DISABLE_IPC=1 NODE_ENV=development tsx server/index.ts
```

## Database Schema

Both databases share the same schema (managed via Drizzle ORM migrations in `Cloud-On-Prem/drizzle/migrations/`). The only difference is the database name.