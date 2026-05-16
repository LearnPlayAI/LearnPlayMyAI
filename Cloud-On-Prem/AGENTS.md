# Cloud-On-Prem Development Environment

This repository is developed from inside WSL/Linux at `/antigravity/Cloud-On-Prem`.

Cardinal rule: all development tooling must run inside the WSL shell, not on the Windows host.

- Do not use Windows-native `node`, `npm`, `npx`, `powershell`, `cmd`, or Windows Codex bundled runtimes for repository commands.
- Do not run package scripts from `C:\...` or `\\wsl.localhost\...` paths.
- Use WSL/Linux paths such as `/antigravity/Cloud-On-Prem`.
- If `node`, `npm`, or `npx` are missing from the current shell, activate/install the WSL Node runtime with:

```bash
bash scripts/dev-workspace/bootstrap-wsl-dev.sh node
```

- Known WSL Node runtime on this host:

```bash
/home/lppadmin/.nvm/versions/node/v20.20.2/bin/node
```

- Before running tests, builds, or dev servers, verify the command is executing in Linux with `pwd`, `uname -a`, and `command -v node`.
- For LearnPlay local DEV, use source-local WSL processes and the workspace scripts, especially `scripts/dev-workspace/local-apps.sh`; do not assume managed runtime paths such as `/opt/learnplay/...` exist on this workstation.
