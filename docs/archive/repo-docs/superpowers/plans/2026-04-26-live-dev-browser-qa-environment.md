# Live Dev Browser QA Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep local cloud and onprem running with server restarts, Vite hot reload, and Codex Desktop browser QA while completely removing retired browser automation tooling.

**Architecture:** Use the existing Express-plus-Vite development server and the local cloud/onprem supervisor already started in this workspace. Each variant runs as its own watched Node process with an explicit env file. Browser QA becomes a documented live workflow using Codex Desktop browser/CDP instead of repository-owned browser automation scripts.

**Tech Stack:** Bash, npm scripts, TypeScript/Express, Vite middleware, tsx watch, Jest, Codex Desktop built-in browser/workspace CDP.

---

## File Structure

- Modify `package.json`: remove the retired browser automation dev dependency; keep and refine local dev supervisor scripts.
- Modify `package-lock.json`: regenerate after removing the retired browser automation packages.
- Modify `scripts/dev-workspace/local-apps.sh`: harden the cloud/onprem process supervisor so both variants run independently and recover cleanly.
- Modify `scripts/dev-workspace/install-local-apps-autostart.sh`: ensure the user-level monitor points at the hardened supervisor.
- Modify `scripts/dev-workspace/CODEX_DESKTOP_MASTER_PROMPT.md`: remove retired browser automation references and document local live browser QA.
- Delete `tests/e2e/Course_Lifecycle.spec.ts`: retired browser automation E2E spec.
- Delete `scripts/liveBrowserUxSweep.ts`: retired browser automation browser sweep.
- Delete `scripts/theme-visual-regression.mjs`: retired browser automation visual regression script.
- Delete `scripts/qa/lessonJourneySweep.mjs`: retired browser automation QA script.
- Delete `scripts/qa/impersonation-theme-cycle.mjs`: retired browser automation QA script.
- Delete `scripts/qa/onprem-tone-activation-check.mjs`: retired browser automation QA script.
- Create `docs/dev/live-browser-qa.md`: operator-facing replacement workflow for live visual QA in Codex Desktop.

## Task 1: Remove Retired Browser Automation Dependency And Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `tests/e2e/Course_Lifecycle.spec.ts`
- Delete: `scripts/liveBrowserUxSweep.ts`
- Delete: `scripts/theme-visual-regression.mjs`
- Delete: `scripts/qa/lessonJourneySweep.mjs`
- Delete: `scripts/qa/impersonation-theme-cycle.mjs`
- Delete: `scripts/qa/onprem-tone-activation-check.mjs`

- [ ] **Step 1: Confirm every active retired browser automation reference**

Run:

```bash
rg -n "browser automation package name|legacy browser sweep output|chromium|firefox" package.json package-lock.json tests scripts docs client server -g '!node_modules' -g '!dist' -g '!build'
```

Expected: Only retired package metadata and the known retired scripts/specs are returned, plus browser text that is not tied to the retired package.

- [ ] **Step 2: Remove the retired browser automation package**

Run:

```bash
npm uninstall retired-browser-automation-package
```

Expected: `package.json` no longer has the retired package in `devDependencies`; `package-lock.json` no longer has the retired package or its core runtime package.

- [ ] **Step 3: Delete retired browser automation scripts and tests**

Run:

```bash
rm -f \
  tests/e2e/Course_Lifecycle.spec.ts \
  scripts/liveBrowserUxSweep.ts \
  scripts/theme-visual-regression.mjs \
  scripts/qa/lessonJourneySweep.mjs \
  scripts/qa/impersonation-theme-cycle.mjs \
  scripts/qa/onprem-tone-activation-check.mjs
```

Expected: The files no longer exist.

- [ ] **Step 4: Verify retired browser automation is gone**

Run:

```bash
rg -n "browser automation package name|legacy browser sweep output|chromium|firefox" package.json package-lock.json tests scripts docs -g '!node_modules' -g '!dist' -g '!build'
```

Expected: No active dependency, import, command, or repository-owned retired browser automation test path remains. Historical design notes may remain only if clearly not an active workflow.

- [ ] **Step 5: Commit removal**

Run:

```bash
git add package.json package-lock.json tests/e2e scripts
git commit -m "chore: remove retired browser qa scripts"
```

Expected: A commit containing only the retired browser automation removal.

## Task 2: Harden The Local Cloud/Onprem Supervisor

**Files:**
- Modify: `package.json`
- Modify: `server/loadEnv.ts`
- Modify: `scripts/dev-workspace/local-apps.sh`
- Modify: `scripts/dev-workspace/install-local-apps-autostart.sh`

- [ ] **Step 1: Confirm local supervisor scripts are exposed through npm**

Open `package.json` and ensure these scripts exist:

```json
"dev:watch": "TSX_DISABLE_IPC=1 NODE_ENV=development tsx watch --exclude 'uploads/**' --exclude 'artifacts/**' --exclude 'dist/**' --exclude 'vite.config.ts.timestamp-*' server/index.ts",
"dev:local:start": "bash scripts/dev-workspace/local-apps.sh start",
"dev:local:ensure": "bash scripts/dev-workspace/local-apps.sh ensure",
"dev:local:stop": "bash scripts/dev-workspace/local-apps.sh stop",
"dev:local:restart": "bash scripts/dev-workspace/local-apps.sh restart",
"dev:local:status": "bash scripts/dev-workspace/local-apps.sh status"
```

Expected: The exact commands exist or equivalent commands point to `scripts/dev-workspace/local-apps.sh`.

- [ ] **Step 2: Confirm explicit env-file loading**

Open `server/loadEnv.ts` and ensure `LEARNPLAY_ENV_FILE` is supported with this behavior:

```ts
const configuredEnvPath = (process.env.LEARNPLAY_ENV_FILE || "").trim();
const envPath = configuredEnvPath
  ? path.resolve(process.cwd(), configuredEnvPath)
  : path.resolve(process.cwd(), ".env");

if (!fs.existsSync(envPath)) {
  if (configuredEnvPath) {
    throw new Error(`Configured env file does not exist: ${envPath}`);
  }
  return;
}
```

Expected: Each local app can run from its own env file and no longer depends on whichever profile was last copied to `.env`.

- [ ] **Step 3: Ensure the supervisor starts each variant with watch mode**

Open `scripts/dev-workspace/local-apps.sh` and ensure `start_variant` launches this process:

```bash
exec npx tsx watch \
  --exclude 'uploads/**' \
  --exclude 'artifacts/**' \
  --exclude 'dist/**' \
  --exclude 'vite.config.ts.timestamp-*' \
  server/index.ts
```

Expected: Server edits restart automatically, generated files are excluded, and the process writes to variant-specific logs.

- [ ] **Step 4: Verify cloud and onprem env files exist**

Run:

```bash
ls -la .env.cloud.local .env.onprem.local
```

Expected: Both files exist. If missing, run:

```bash
bash scripts/dev-workspace/bootstrap-wsl-dev.sh env
```

- [ ] **Step 5: Verify the supervisor status command is safe**

Run:

```bash
npm run dev:local:status
```

Expected: It reports cloud and onprem state, port, pid, health, and log path. It may report stopped before the apps are started.

- [ ] **Step 6: Commit supervisor hardening**

Run:

```bash
git add package.json server/loadEnv.ts scripts/dev-workspace/local-apps.sh scripts/dev-workspace/install-local-apps-autostart.sh
git commit -m "feat: add local cloud onprem dev supervisor"
```

Expected: A commit containing only the local supervisor changes.

## Task 3: Document The Codex Desktop Browser QA Workflow

**Files:**
- Create: `docs/dev/live-browser-qa.md`
- Modify: `scripts/dev-workspace/CODEX_DESKTOP_MASTER_PROMPT.md`

- [ ] **Step 1: Create the live QA document**

Create `docs/dev/live-browser-qa.md` with this content:

```markdown
# Live Browser QA In Codex Desktop

Use this workflow for local visual QA. retired browser automation tooling is not part of this repository or workflow.

## Start Local Apps

```bash
npm run dev:local:ensure
npm run dev:local:status
```

Cloud runs at `http://localhost:8010`.
Onprem runs at `http://localhost:8020`.

## Test A Journey

1. Open the target local URL in Codex Desktop's built-in browser.
2. Perform the user journey step by step.
3. Capture screenshots for each failure or important state.
4. Record the result as `pass`, `fail`, or `blocked`.
5. Include the variant, role, URL, exact action, expected result, actual result, and screenshot path.
6. After fixes, rerun the failed path and one adjacent regression path.

## Suggested Prompt For Browser Agents

```text
Open Cloud at http://localhost:8010 and Onprem at http://localhost:8020.
Test this journey: <journey>.
For each variant, record role, route, steps, pass/fail/blocked result, visible issues, console or network symptoms if available, and screenshot evidence.
Do not use retired browser automation tooling. Use the Codex Desktop browser or workspace CDP browser only.
```

## Server And Client Changes

Server-side changes restart through the local `tsx watch` process.
Client-side changes hot reload through Vite on the same cloud/onprem URL.
If a change does not appear, run:

```bash
npm run dev:local:restart
```
```

Expected: The document gives agents and developers a repeatable non-retired-browser-automation loop.

- [ ] **Step 2: Update the Codex Desktop master prompt**

Edit `scripts/dev-workspace/CODEX_DESKTOP_MASTER_PROMPT.md` so local visual testing references:

```text
Use Codex Desktop's built-in browser or workspace CDP browser flow.
Do not install, invoke, or generate retired browser automation tooling tests.
For local QA, follow docs/dev/live-browser-qa.md.
```

Expected: The prompt no longer presents retired browser automation tooling as a valid local testing path.

- [ ] **Step 3: Verify docs contain no active retired browser automation tooling workflow**

Run:

```bash
rg -n "retired browser automation tooling|retired-browser-automation" docs scripts/dev-workspace/CODEX_DESKTOP_MASTER_PROMPT.md -g '!docs/superpowers/specs/**' -g '!docs/superpowers/plans/**'
```

Expected: No active workflow doc tells agents to install, invoke, or write retired browser automation tooling tests.

- [ ] **Step 4: Commit documentation**

Run:

```bash
git add docs/dev/live-browser-qa.md scripts/dev-workspace/CODEX_DESKTOP_MASTER_PROMPT.md
git commit -m "docs: add live browser qa workflow"
```

Expected: A commit containing only workflow documentation.

## Task 4: Verify Local Runtime And Non-retired browser automation tooling Gates

**Files:**
- No expected source edits. Any fix discovered here must be a new scoped task before editing.

- [ ] **Step 1: Install dependency state after retired browser automation tooling removal**

Run:

```bash
npm install
```

Expected: Dependencies install cleanly and retired browser automation tooling is not reintroduced.

- [ ] **Step 2: Validate no retired browser automation tooling remains**

Run:

```bash
rg -n "retired-browser-automation|retired browser automation tooling|@retired-browser-automation|npx retired-browser-automation|chromium|firefox" package.json package-lock.json tests scripts docs -g '!node_modules' -g '!dist' -g '!build'
npm ls retired-browser-automation
```

Expected: `rg` returns no active retired browser automation tooling references; `npm ls retired-browser-automation` reports empty or missing.

- [ ] **Step 3: Run static and critical checks**

Run:

```bash
npm run -s check
NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:critical
```

Expected: Both pass. If a pre-existing blocker appears, capture the exact command, error, and suspected owner without mixing that fix into this change.

- [ ] **Step 4: Start both local apps**

Run:

```bash
npm run dev:local:ensure
npm run dev:local:status
```

Expected: Cloud is healthy at `http://localhost:8010`; onprem is healthy at `http://localhost:8020`.

- [ ] **Step 5: Smoke test in Codex Desktop browser**

Open:

```text
http://localhost:8010
http://localhost:8020
```

Expected: Both public pages render without a blank screen. Record any visible issue with variant, URL, result, and screenshot evidence.

- [ ] **Step 6: Verify server restart and Vite hot reload**

Touch a harmless server file timestamp and inspect logs:

```bash
touch server/vite.ts
sleep 5
npm run dev:local:status
```

Expected: The watched process remains healthy after restart.

For Vite hot reload, make a reversible text-only client change in a low-risk visible local test area, confirm the browser updates, then revert that temporary change before committing.

- [ ] **Step 7: Final commit or amend**

If verification required source or documentation tweaks, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilize local browser qa environment"
```

Expected: Final source state contains no retired browser automation tooling and local runtime verification evidence is ready for the completion report.

## Self-Review

Spec coverage:

- Always-on local cloud/onprem: Task 2 and Task 4.
- Server restart: Task 2 and Task 4.
- Vite hot reload: Task 2 and Task 4.
- Complete retired browser automation tooling removal: Task 1 and Task 4.
- Codex Desktop live browser QA: Task 3 and Task 4.
- Cloud/onprem parity: Task 2, Task 3, and Task 4.

Placeholder scan:

- No `TBD`, `TODO`, `implement later`, or vague test instructions are present.

Type and command consistency:

- All commands use existing npm/script names or files listed in the design.
- The local URLs match the approved spec: cloud `8010`, onprem `8020`.
