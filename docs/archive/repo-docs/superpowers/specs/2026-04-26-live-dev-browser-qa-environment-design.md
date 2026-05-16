# Live Development And Browser QA Environment Design

Date: 2026-04-26
Scope: LearnPlay Cloud and Onprem local development in Codex Desktop

## Goal

Create a development environment where both LearnPlay variants are always available locally:

- Cloud at `http://localhost:8010`
- Onprem at `http://localhost:8020`

Server changes should restart automatically. Client changes should hot reload through Vite. Visual testing should happen live in the Codex Desktop built-in browser or workspace CDP browser flow. retired browser automation tooling must be removed completely from the repository and from the development workflow.

## Current Context

The app already runs Express and Vite together in development. `server/index.ts` starts the HTTP server, registers API routes, then mounts Vite middleware through `server/vite.ts`. That means a single local port can serve both API and client assets while still using Vite hot reload.

Local cloud/onprem support is partially present in the current workspace through:

- Variant env files: `.env.cloud.local` and `.env.onprem.local`
- A local app supervisor script: `scripts/dev-workspace/local-apps.sh`
- An autostart monitor installer: `scripts/dev-workspace/install-local-apps-autostart.sh`
- Package scripts such as `dev:local:ensure`, `dev:local:restart`, and `dev:local:status`
- `LEARNPLAY_ENV_FILE` support in `server/loadEnv.ts`

retired browser automation tooling is still present in active repository content and must be removed:

- `package.json` / `package-lock.json`
- `tests/e2e/Course_Lifecycle.spec.ts`
- `scripts/liveBrowserUxSweep.ts`
- `scripts/theme-visual-regression.mjs`
- `scripts/qa/lessonJourneySweep.mjs`
- `scripts/qa/impersonation-theme-cycle.mjs`
- `scripts/qa/onprem-tone-activation-check.mjs`

## Recommended Approach

Use a local two-variant supervisor plus Codex Desktop live browser QA.

The supervisor starts both variants in the background with their own env file. Each server runs through `tsx watch`, so backend and server-side TypeScript changes restart the affected process. Vite remains mounted inside Express, so client edits hot reload in the browser without needing a second frontend port.

retired browser automation tooling will be removed completely. Visual journeys will be executed through Codex Desktop's browser tools against the live local apps, with screenshots, step outcomes, and bug notes written as artifacts or issue reports.

## Architecture

### Local Runtime

`scripts/dev-workspace/local-apps.sh` owns the local process lifecycle:

- `ensure`: starts cloud and onprem if missing
- `status`: reports process, port, health, and log path
- `restart`: restarts one or both variants
- `stop`: stops one or both variants
- `logs`: prints log locations

Each variant starts with:

- `NODE_ENV=development`
- `TSX_DISABLE_IPC=1`
- `LEARNPLAY_ENV_FILE=<variant env path>`
- `npx tsx watch ... server/index.ts`

The server loads the explicit env file through `server/loadEnv.ts`, then starts on the `PORT` in that file. This prevents one variant from depending on whichever profile was last copied to `.env`.

### Hot Reload And Restart Behavior

Server-side changes are handled by `tsx watch`. Watch exclusions prevent noisy or generated folders from restarting the server:

- `uploads/**`
- `artifacts/**`
- `dist/**`
- `vite.config.ts.timestamp-*`

Client-side changes are handled by Vite middleware inside the Express dev server. The browser stays on the variant URL and receives normal Vite hot reload updates.

### Always-On Behavior

`scripts/dev-workspace/install-local-apps-autostart.sh` installs a user-level systemd timer that periodically runs the local supervisor's `ensure all` command. This makes the environment recover after WSL/session startup and after process exits.

The monitor is intentionally simple. It does not replace `tsx watch`; it only ensures each variant process exists and passes health checks.

## Browser QA Workflow

retired browser automation tooling will not be used for visual testing.

The live QA loop is:

1. Start or ensure both local apps.
2. Open `http://localhost:8010` and `http://localhost:8020` in Codex Desktop's built-in browser or the workspace CDP browser flow.
3. Execute the requested user journey directly in the browser.
4. Capture screenshots, observed results, console/network symptoms where available, and clear reproduction notes.
5. Classify each result as `pass`, `fail`, or `blocked`.
6. Developer fixes source code.
7. Local supervisor/Vite updates the running environment.
8. Rerun the same journey and adjacent regression checks.

For deployed DEV validation, the existing LearnPlay CDP policy still applies: changes must be committed, pushed, deployed to Cloud DEV and Onprem DEV, then tested through workspace-local CDP against the DEV domains.

## Role-Journey Matrix

The local environment must support the same journey shape across both variants unless the product behavior is intentionally variant-specific.

| Role | Stage | Cloud | Onprem | Evidence Source |
| --- | --- | --- | --- | --- |
| unauthenticated | entry | same | same | public route in browser |
| unauthenticated | error path | same | same | invalid route/API state |
| support | auth | superadmin | custsuper | seeded bootstrap identity |
| superadmin | core task | cloud-specific | not applicable | cloud admin routes |
| custsuper | core task | not applicable | onprem-specific | onprem admin routes |
| orgadmin | core task | same unless flagged | same unless flagged | authenticated org route |
| teacher | core task | same unless flagged | same unless flagged | course/lesson route |
| student | core task | same unless flagged | same unless flagged | assigned learning route |
| any authenticated role | recovery | same unless flagged | same unless flagged | reload, retry, navigation |
| any role | exit | same | same | logout/close path |

## Validation Matrix

Implementation is complete when:

- `npm install` succeeds after retired browser automation tooling removal.
- No repository files import or invoke retired browser automation tooling.
- `package-lock.json` no longer includes retired browser automation tooling packages.
- Cloud local app starts and health check passes on port `8010`.
- Onprem local app starts and health check passes on port `8020`.
- A simple browser smoke renders both local public pages.
- Server edit restart behavior is verified or documented with a safe manual restart fallback.
- Client edit hot reload behavior is verified in the browser.
- Existing non-retired-browser-automation checks still run, with any pre-existing blockers documented.

Recommended checks:

- `npm run -s check`
- `npm run -s test:critical`
- `npm run dev:local:ensure`
- `npm run dev:local:status`
- Browser smoke for both local URLs

## Source Control And Safety

Do not revert existing uncommitted user work. The implementation should preserve the current local supervisor direction already present in the workspace, tighten it where needed, and remove retired browser automation tooling references cleanly.

No runtime deployment is part of the local environment setup unless the user separately asks to deploy. If deployment is requested later, the LearnPlay commit-before-deploy rule applies.

## Acceptance Criteria

- Developers can keep cloud and onprem running locally during daily work.
- Server changes restart automatically.
- Client changes hot reload through Vite.
- Codex Desktop can visually test live local user journeys without retired browser automation tooling.
- retired browser automation tooling is completely removed from dependencies, tests, scripts, and docs that present it as an active path.
- The remaining QA workflow produces actionable screenshots, outcomes, and bug notes for a developer to fix and retest in a loop.
