# LearnPlay Active Context

## Current Focus
Browser testing via webclaw successfully verified the LearnPlay homepage (https://learnplay.co.za). The page loads correctly with:
- Navigation header (Home, Browse Courses, Sign In, Get Started)
- Hero section with "Smart Learning Made Easy" tagline
- Showcase courses carousel (3 visible courses with navigation)
- Features section (Create Courses, Gamification, Analytics)
- On-premise deployment information section
- Comprehensive footer with links

## Recent Changes
- Memory Bank documentation system initialized
- Browser testing policy verified using webclaw MCP tool
- **Native dev setup analysis complete** — 100% native approach selected (zero Docker)
- **Host system profiled** — All dependencies present on Ubuntu Linux except ffmpeg and poppler-utils
- **2026-05-16: Native dual-dev setup implemented** — Both Cloud and OnPrem dev servers verified starting successfully
- **2026-05-16: Centralized .secrets vault created** — Consolidated secrets from .env.cloud and .env.onprem into workspace root `.secrets` file for Cline reference
- **2026-05-16: Server-startup skill created** — Automated dev server lifecycle management (start/restart/stop with DB check, code change detection, and auto-build)

## Native Dev Setup Discovery
- System migrated from WSL to native Ubuntu Linux
- Host already has: Node.js 22.22.1, npm 9.2.0, PostgreSQL 18.3, gcc/g++ 15.2, python3 3.14.4, LibreOffice 26.2.2.2
- Decision: 100% native dev — no Docker containers for dev environment
- Two PostgreSQL databases on host PostgreSQL server: `learnplay_cloud` and `learnplay_onprem` (both on port 5432, different DB names)
- Cloud dev on port 5000, OnPrem dev on port 5001
- node_modules, Node.js, npm all run natively in workspace
- Two separate .env files: `.env.cloud` and `.env.onprem`
- Only missing host packages: `ffmpeg` and `poppler-utils`

## Next Steps
1. ✅ Complete Memory Bank documentation (systemPatterns, techContext, progress)
2. ✅ Update .clinerules with Memory Bank custom instructions
3. ✅ Document native dev setup in techContext.md
4. ✅ Implement native dev setup (create .env files, create databases, install packages)
5. ✅ Verify Cloud dev server starts on port 5000
6. ✅ Verify OnPrem dev server starts on port 5001
7. ✅ Create centralized .secrets vault at workspace root
8. ✅ Verify Cloud homepage loads correctly via webclaw
9. ✅ Verify OnPrem homepage loads correctly via webclaw
10. ✅ Create server-startup skill for automated dev server lifecycle management
11. ⏳ Verify server-startup skill works end-to-end
12. ⏳ Run full test suite (`npm run test:viewer-critical`)
13. ⏳ Regenerate production session secrets in .env files

## Active Decisions and Considerations
- **Browser Testing**: Strictly use webclaw MCP tool only - no Playwright
- **Documentation**: Memory Bank files should be concise and updated after significant milestones
- **Naming Convention**: Snake case for DB columns/tables, camelCase in application code
- **Dev Deployment**: 100% native — no Docker containers in dev environment
- **Database Strategy**: Single PostgreSQL instance with two databases (learnplay_cloud, learnplay_onprem)
- **Port Separation**: Cloud=5000, OnPrem=5001

## Important Patterns and Preferences
- TypeScript strictly enforced
- Zod for runtime validation at API boundaries
- Drizzle ORM for all database operations
- Component composition over monolithic components
- Theme system supports dual-token architecture
- All migrations documented in SQL with clear comments

## Important Path Mappings
| Production Path | Dev Path |
|----------------|----------|
| `/opt/learnplay/cloud/uploads` | `./uploads/` (workspace-relative) |
| `/opt/learnplay/onprem/uploads` | `./uploads/` (shared) |
| `/opt/lpdb/cloud/pg16/main` | Host DB `learnplay_cloud` |
| `/opt/lpdb/onprem/pg16/main` | Host DB `learnplay_onprem` |
| `/lppbackups/cloud/database` | `./.backups/cloud/database/` |
| `/lppbackups/onprem/database` | `./.backups/onprem/database/` |
| `/opt/learnplay/version.json` | `./version.json` |

## Secrets Management
| File | Purpose |
|------|---------|
| `.secrets` (workspace root) | Centralized secrets vault — all secrets in one place for Cline reference |
| `Cloud-On-Prem/.env.cloud` | Cloud deployment runtime config (copied from .secrets values) |
| `Cloud-On-Prem/.env.onprem` | OnPrem deployment runtime config (copied from .secrets values) |
| `Cloud-On-Prem/.env.enc` | Encrypted production secrets (managed by secrets-manager.sh) |
| `Cloud-On-Prem/cloud/secrets-manager.sh` | OpenSSL AES-256-CBC encryption manager for production .env files |

## Learnings and Insights
- webclaw provides excellent accessibility tree snapshots via `page_snapshot`
- `screenshot` tool captures visual rendering accurately
- Project has 100+ database migrations tracking feature evolution
- Dual deployment mode (cloud/onprem) shares same codebase
- Production install scripts (install-deps.sh) provision 11 system packages + PM2
- Dev needs only 2 additional packages: ffmpeg and poppler-utils
- Upload directory resolved via `UPLOAD_DIR` env var, defaults to `./uploads`
- Backup paths checked in priority order by demoDataService.ts
- Runtime identity detection uses cwd path heuristics (`/opt/learnplay/cloud`, `/opt/learnplay/onprem`)

## Trial & License Management — System Variants

### Cloud System Variant
- Organizations have **trial validity dates** (`trialStartDate`, `trialEndDate`)
- When trial expires and organization is not subscribed → login blocked with 403 "Trial expired"
- **Demo organizations** (`isDemo = true`) **never expire** regardless of trial dates — this is a hard gate override
- Setting `isDemo = true` on an organization bypasses all trial expiration checks

### OnPrem System Variant
- **All organizations are automatically demo** — `isDemo = true` is set automatically upon registration
- OnPrem users **never pay for individual subscriptions** — they pay for a **system license** monthly
- OnPrem systems register with the Cloud production system for license management
- License lifecycle: managed centrally in Cloud, enforced on OnPrem instances

### Key Tables and Columns
- `organizations.isDemo` — Boolean flag that prevents trial expiration when true
- `organizations.trialStartDate` / `trialEndDate` — Trial validity dates (only enforced when `isDemo = false`)
- `organizations.subscriptionStatus` — Values: `active`, `expired`, `trialing`
- `organizations.licenseEnabled` — Whether the org has enterprise license features enabled

### License System Architecture
- Cloud production system = central license registry
- OnPrem systems = license consumers, sync with Cloud for validation
- Enterprise license tables: `enterprise_license_lifecycle_and_telemetry` migration
- License sync credentials stored in `onprem_system_sync_credentials`
- Platform manages all licenses; OnPrem instances validate against them

## Recent Updates
- **2026-05-16: Support user login verified** — Password updated, isDemo set on org, login successful to /super-admin
- **2026-05-16: Trial expiration issue identified and resolved** — Organization had trialStartDate but login was blocked by trial check; setting `isDemo=true` resolved it
