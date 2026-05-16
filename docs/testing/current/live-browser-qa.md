# Live Browser QA In Codex Desktop

Use this workflow for local visual QA. Repository-owned browser automation scripts are not part of this workflow.

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

## Automated Agent Loop

Use this loop when asking a Codex agent to test and drive fixes from the desktop browser:

1. `ensure`: run `npm run dev:local:ensure` and confirm both variants are healthy.
2. `open`: use the built-in browser or workspace CDP browser to open the cloud and onprem URLs.
3. `exercise`: perform the requested user journey as a user would, without prewritten browser test files.
4. `capture`: save screenshots and record visible symptoms, route, role, variant, console/network symptoms when available, and reproduction steps.
5. `classify`: mark each step as `pass`, `fail`, or `blocked`.
6. `fix`: make source-code changes only; do not patch runtime state by hand.
7. `refresh`: rely on Vite hot reload for client-only changes and `tsx watch` for server changes. If state is unclear, run `npm run dev:local:restart`.
8. `retest`: rerun the exact failed path and at least one adjacent regression path in both variants.
9. `close`: keep the issue open until the retest evidence is `pass` or the blocker is explicitly documented.

Write each run to an artifact folder such as:

```text
artifacts/browser-qa/YYYY-MM-DD-journey-name/
```

Recommended files:

```text
report.md
cloud-step-01.png
onprem-step-01.png
```

Use this result table in `report.md`:

```markdown
| Variant | Role | Route | Step | Result | Evidence | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| cloud | <role> | <url> | <action> | pass/fail/blocked | <screenshot> | <summary> |
| onprem | <role> | <url> | <action> | pass/fail/blocked | <screenshot> | <summary> |
```

## Suggested Prompt For Browser Agents

```text
Open Cloud at http://localhost:8010 and Onprem at http://localhost:8020.
Test this journey: <journey>.
For each variant, record role, route, steps, pass/fail/blocked result, visible issues, console or network symptoms if available, and screenshot evidence.
Use the Codex Desktop browser or workspace CDP browser only.
Write the results to artifacts/browser-qa/<date>-<journey>/report.md.
After a developer fix, rerun the failed path and one adjacent regression path.
```

## Server And Client Changes

Server-side changes restart through the local `tsx watch` process.
Client-side changes hot reload through Vite on the same cloud/onprem URL.
If a change does not appear, run:

```bash
npm run dev:local:restart
```
