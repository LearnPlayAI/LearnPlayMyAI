---
name: learnplay-browser-automation
description: "LearnPlay UI testing and browser automation policy using workspace-native Chrome CDP."
---

# LearnPlay Browser Automation & UI Testing Policy

Use this environment’s standard UI inspection method: CDP only.

## Purpose
When you need to inspect UI behavior, attach your browser agent to a workspace-local Chrome CDP instance and interact directly in-browser.

## Mandatory Operating Rules
1) Start Chrome with CDP in your workspace context:
   `CDP_PORT=9222 /antigravity/scripts/start-workspace-cdp.sh`

2) Verify CDP is available:
   `/antigravity/scripts/check-workspace-cdp.sh 9222`

3) Attach your browser agent to:
   - `http://127.0.0.1:9222`
   or
   - the webSocketDebuggerUrl from:
     `curl -fsS http://127.0.0.1:9222/json/version`

4) Navigate to the required DEV system:
   - Cloud DEV:  `https://stcloud.learnplay.co.za`
   - Onprem DEV: `https://stonprem.learnplay.co.za`

## Environment Notes
- The CDP launcher already applies host resolver rules so these domains route via Caddy (192.168.89.10). You do not need to edit /etc/hosts or handle TLS proxy errors manually.
- Do not use managed MCP browser mode for this workflow.
- Do not use shared/host-level CDP endpoints.
- Do not create prewritten Playwright test files just to inspect UI.
- All testing MUST only occur after changes are deployed using the `devadmin` deploy tools (`update-dev.sh`).

## Expected Operating Style
- Attach once.
- Open the target page.
- Interact via natural-language browser actions (click/fill/type/navigate/snapshot/screenshot) as needed.
- Use this approach for ad-hoc UI inspection/debugging and manual validation steps.
