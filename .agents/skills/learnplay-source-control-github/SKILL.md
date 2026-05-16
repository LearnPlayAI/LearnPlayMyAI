---
name: learnplay-source-control-github
description: Mandatory source control and GitHub integration policy. Use this to ensure code is committed to GitHub BEFORE deployments, while treating the workspace as the primary source of truth.
---

# Source Control and GitHub Integration Policy

## When To Use
- Use this policy before deploying any changes (UI, backend, or configuration) via the `devadmin` runtime deploy tools.

## Source of Truth Architecture
1. **Workspace is Primary:** The source code in this local workspace is the central, definitive source of proof.
2. **GitHub is Backup:** GitHub serves entirely as our backup solution and external integration point, not the primary source of truth.

## Commit-Before-Deploy Rule (Mandatory)
1. You MUST commit to standard source control and push to GitHub **before** executing any deployment via the `devadmin` tools.
2. The sequence of operations must always be:
   - Step 1: Make your changes natively in the workspace.
   - Step 2: Ensure basic syntax and local validation checks pass.
   - Step 3: **Commit your changes and push them to GitHub.**
   - Step 4: Deploy the changes to the DEV runtime environments (cloud and onprem) using the `devadmin` deploy tools on the host.

By strictly adhering to this sequence, we ensure the deployed runtimes only execute code safely backed up in our secondary GitHub storage, avoiding "orphaned" runtime states.
