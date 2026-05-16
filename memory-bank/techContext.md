# LearnPlay Tech Context

## Technologies Used

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI component library |
| TypeScript | 5.6.3 | Static type checking |
| Vite | 5.4.19 | Build tool and dev server |
| TailwindCSS | 3.4.17 | Utility-first CSS framework |
| Radix UI | Various | Accessible headless components |
| wouter | 3.3.5 | Lightweight routing |
| React Hook Form | 7.55.0 | Form handling |
| Zod | 3.24.2 | Schema validation |
| Zod Validation Error | 3.4.0 | User-friendly error messages |
| Framer Motion | 11.18.2 | Animations |
| Recharts | 2.15.4 | Data visualization |
| @tanstack/react-query | 5.60.5 | Server state management |
| socket.io-client | 4.8.1 | Real-time client communication |

### Additional UI Components
| Technology | Purpose |
|---|---|
| embla-carousel-react | Carousel/slider components |
| vaul | Drawer component |
| cmdk | Command palette |
| input-otp | OTP input fields |
| react-day-picker | Date picker |
| react-resizable-panels | Resizable panel layouts |
| lucide-react | Icon library |
| react-icons | Additional icons |
| flag-icons | Country flag icons |
| canvas-confetti | Confetti animations |

### Date/Utility Libraries
| Technology | Purpose |
|---|---|
| date-fns | Date manipulation |
| date-fns-tz | Timezone support |
| clsx + tailwind-merge | Conditional class names |
| class-variance-authority | Component variants |
| next-themes | Theme toggling |

### Document Processing
| Technology | Purpose |
|---|---|
| pdf-parse | PDF text extraction |
| pdfkit | PDF generation |
| mammoth | DOCX reading |
| docx | DOCX creation |
| fast-xml-parser | XML parsing |
| pptx-in-html-out | PPTX to HTML conversion |
| pptx-preview | PPTX preview rendering |
| sharp | Image processing |

### File Upload
| Technology | Purpose |
|---|---|
| @uppy/core | File upload core |
| @uppy/dashboard | Upload dashboard UI |
| @uppy/aws-s3 | S3-compatible uploads |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Express.js | 4.21.2 | HTTP server framework |
| Socket.IO | 4.8.1 | Real-time communication |
| ws | 8.18.0 | WebSocket implementation |
| Passport.js | 0.7.0 | Authentication |
| passport-local | 1.0.38 | Local auth strategy |
| express-session | 1.18.2 | Session management |
| connect-pg-simple | 7.0.3 | PostgreSQL session store |
| bcrypt | 6.0.0 | Password hashing |
| multer | 2.0.2 | File upload parsing |
| nodemailer | 8.0.1 | Email sending |
| memoizee | 0.4.17 | Function result caching |
| open-id-client | 6.7.1 | OpenID Connect support |
| archiver | 7.0.1 | Archive creation |
| unzipper | 0.12.3 | Archive extraction |
| axios | 1.13.2 | HTTP client |

### Database
| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | 16+ | Primary database |
| Drizzle ORM | 0.39.1 | Type-safe ORM |
| Drizzle Kit | 0.30.4 | Migration tooling |
| drizzle-zod | 0.7.0 | Schema-to-Zod |
| @neondatabase/serverless | 0.10.4 | Neon serverless driver |

### Cloud/Storage
| Technology | Purpose |
|---|---|
| @google-cloud/storage | Google Cloud Storage |
| @replit/object-storage | Replit object storage |
| @google/genai | Google Generative AI |

### Testing
| Technology | Version | Purpose |
|---|---|---|
| Jest | 30.2.0 | Test runner |
| ts-jest | 29.4.5 | TypeScript support |
| Supertest | 7.1.4 | HTTP assertions |
| @jest/globals | 30.2.0 | Global test functions |
| @types/jest | 30.0.0 | TypeScript types |

## Development Setup

### Starting Development
```bash
cd Cloud-On-Prem
npm run dev              # Start dev server (tsx, single run)
npm run dev:watch        # Start dev server with file watcher
```

### Building
```bash
npm run build            # Full production build (Vite + esbuild)
```

### Database
```bash
npm run db:push                # Push schema to database
```

### Testing
```bash
npm run test                    # Full test suite
npm run test:server             # Backend tests only
npm run test:client             # Frontend tests only
npm run test:viewer-critical    # Critical path tests
npm run coverage                # Coverage report
```

### Validation
```bash
npm run check            # Full validation suite
```

### Native Dev Setup (Ubuntu Linux — Zero Docker)

#### Prerequisites — Install 2 missing packages
```bash
sudo apt install -y ffmpeg poppler-utils
```

#### Server Lifecycle Management (Server-Startup Skill)

Use the **server-startup** skill (`skills/server-startup/SKILL.md`) to manage dev servers. Invoke with natural language:

```bash
# Start cloud dev server
start dev cloud

# Start onprem dev server  
start onprem

# Restart cloud (with code change detection + build)
restart dev cloud

# Stop onprem
stop onprem
```

**Workflow:**
1. Check if server is already running on target port
2. Check database connectivity (PostgreSQL on localhost:5432)
3. Detect uncommitted code changes → build if needed
4. Start/restart/stop server with PID management
5. Present 3 options: 🔁 Restart, ▶️ Start, ⏹️ Stop

**Environment mapping:**

| Environment | Port | DB Name | PID File | Log File |
|-------------|------|---------|----------|----------|
| dev cloud | 5000 | learnplay_cloud | .server-cloud.pid | logs/learnplay-dev-cloud.log |
| dev onprem | 5001 | learnplay_onprem | .server-onprem.pid | logs/learnplay-dev-onprem.log |

**Only supports dev environments** — acc/prd are managed by deployment scripts.

#### Create PostgreSQL databases
```bash
# Create user and databases on host PostgreSQL (single instance, two databases)
sudo -u postgres psql -c "CREATE USER learnplay WITH PASSWORD 'learnplay_dev_secret';" 2>/dev/null || true
sudo -u postgres createdb -O learnplay learnplay_cloud 2>/dev/null || true
sudo -u postgres createdb -O learnplay learnplay_onprem 2>/dev/null || true
sudo -u postgres psql -d learnplay_cloud -c "GRANT ALL ON SCHEMA public TO learnplay;"
sudo -u postgres psql -d learnplay_onprem -c "GRANT ALL ON SCHEMA public TO learnplay;"
```

#### Install project dependencies and create directories
```bash
cd Cloud-On-Prem
npm install
mkdir -p uploads/public uploads/private
mkdir -p .backups/cloud/database .backups/onprem/database
```

#### Start Cloud Dev Server (port 5000)
```bash
cd Cloud-On-Prem
cp .env.cloud .env
npm run dev    # → http://localhost:5000
```

#### Start OnPrem Dev Server (port 5001)
```bash
cd Cloud-On-Prem
cp .env.onprem .env
npm run dev    # → http://localhost:5001
```

#### Push Schema to Databases
```bash
# Push to Cloud database
cp .env.cloud .env && npm run db:push

# Push to OnPrem database
cp .env.onprem .env && npm run db:push
```

### Host System Requirements
| Package | Required | Current | Status |
|---------|----------|---------|--------|
| Node.js | 20+ | 22.22.1 | ✅ Installed |
| npm | 9+ | 9.2.0 | ✅ Installed |
| PostgreSQL | 16+ | 18.3 | ✅ Installed |
| gcc/g++ | Any | 15.2 | ✅ Installed |
| python3 | Any | 3.14.4 | ✅ Installed |
| ffmpeg | Any | — | ⚠️ Needs install |
| poppler-utils | Any | — | ⚠️ Needs install |
| LibreOffice | Any | 26.2.2.2 | ✅ Installed |

### Technical Constraints

#### Environment
- **TypeScript strictly enforced** - All code fully typed
- **Zod runtime validation** - All external inputs validated at boundaries
- **Drizzle ORM preferred** - Raw SQL only when necessary
- **No hardcoded secrets** - Use environment variables/secrets manager
- **Browser testing** - ONLY use webclaw MCP tool (never Playwright)

#### Build Constraints
- **Vite build** for frontend (output: `dist/public`)
- **esbuild bundle** for backend (output: `dist/index.js`)
- **Node.js ESM** module system (`"type": "module"`)
- **TSX** for server-side TypeScript execution

#### Database Constraints
- **Migration-driven schema** - All changes via SQL migrations
- **Sequential migration numbering** - 0001_, 0002_, etc.
- **Snake case for DB** - Columns and tables use snake_case
- **Foreign key integrity** - Referential constraints enforced

## Dependencies Management

### Key Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - TailwindCSS configuration
- `drizzle.config.ts` - Drizzle ORM configuration
- `jest.config.js` - Jest test configuration
- `postcss.config.js` - PostCSS processing

### Path Aliases (Vite)
- `@` → `client/src`
- `@shared` → `shared`
- `@assets` → `attached_assets`

### Production Path Mapping (Dev vs Production)
| Production Path | Dev Path |
|----------------|----------|
| `/opt/learnplay/cloud/uploads` | `./uploads/` |
| `/opt/learnplay/onprem/uploads` | `./uploads/` (shared) |
| `/opt/lpdb/cloud/pg16/main` | Host DB `learnplay_cloud` |
| `/opt/lpdb/onprem/pg16/main` | Host DB `learnplay_onprem` |
| `/lppbackups/cloud/database` | `./.backups/cloud/database/` |
| `/lppbackups/onprem/database` | `./.backups/onprem/database/` |
| `/opt/learnplay/version.json` | `./version.json` |
| `/var/log/learnplay/` | stdout/stderr (no file logs) |

### Environment URL Mapping (Browser Testing)

Used by the **browser-testing** skill (`skills/browser-testing/SKILL.md`) to resolve natural language environment names to URLs.

| Keyword(s) | URL | Purpose |
|------------|-----|---------|
| `dev cloud` | `http://localhost:5000` | Local cloud development server |
| `dev onprem` | `http://localhost:5001` | Local on-premise development server |
| `acc cloud` | `https://acccl.learnplay.co.za` | Acceptance testing cloud |
| `acc onprem` | `https://accop.learnplay.co.za` | Acceptance testing on-premise |
| `prd cloud` | `https://learnplay.co.za` | Production cloud |
| `prd onprem` | `https://prdop.learnplay.co.za` | Production on-premise |

**Single keyword defaults:** `dev` → dev cloud, `acc` → acc cloud, `prd` → prd cloud

**Alternative names:** `local`/`localhost` → dev cloud, `staging`/`stg` → acc cloud, `production`/`prod` → prd cloud

**Credential lookup:** Read from `.secrets` file:
- Cloud: `ADMIN_EMAIL_CLOUD` = `demo@learnplay.co.za`, `ADMIN_PASSWORD_CLOUD` = `DevPlatform@1`
- OnPrem: `ADMIN_EMAIL_ONPREM` = `demo@learnplay.co.za`, `ADMIN_PASSWORD_ONPREM` = `DevPlatform@1`

**Test user records:** Stored in `skills/browser-testing/testinfo/{env}-users.json`
**Journey documentation:** Stored in `skills/browser-testing/journeys/{env}-{flow}.md`

### Browser Testing with Webclaw

The **browser-testing** skill uses the webclaw MCP server for all browser interactions:

- **Server:** `webclaw` (configured via `npx -y webclaw-mcp`)
- **Key tools:** `navigate_to`, `page_snapshot`, `click`, `type_text`, `screenshot`, `evaluate`, `wait_for_navigation`
- **Resolution:** 1280x800 pixels
- **Policy:** NEVER use Playwright — webclaw is the ONLY browser automation tool

For full tool reference, see `skills/browser-testing/references/webclaw-tool-reference.md`
