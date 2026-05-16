# LearnPlay DEV Disaster Recovery Guide

This guide explains how to recreate the LearnPlay development environment on a new clean VM using the DR tooling implemented in `devadmin`.

## Scope

- Recreates a working development environment (not a network-identity clone).
- Restores workspace, runtime trees, selected system config, PostgreSQL logical backup, and SSH keys.
- Uses DR inputs for cloud/onprem FQDN and IP mappings.
- Keeps the DR VM hostname unchanged.

## Important Notes

- Current DR bundle is **not encrypted**.
- Bundle contains sensitive data (including SSH key material and environment files).
- Handle and transfer bundle only over trusted channels.

## Paths and Tools

- DEV workspace root: `/antigravity/Cloud-On-Prem`
- DR scripts: `/antigravity/scripts/dr`
- `devadmin`: `/antigravity/devadmin.sh` (symlinked to `/usr/local/bin/devadmin`)
- DR bundle output dir: `/antigravity/archives`

## DR Workflow Overview

1. Create DR bundle on current DEV host.
2. Verify bundle integrity.
3. Prepare clean DR VM.
4. Restore DR bundle on DR VM (remote from DEV, or local on DR VM).
5. Run post-checks and validate readiness.

---

## 1) Create DR Bundle on DEV Host

Run on current DEV host:

```bash
sudo devadmin dr-create
```

Optional flags for larger/fuller bundle:

```bash
sudo /antigravity/scripts/dr/create-dev-bundle.sh --include-raw-db-files --include-lppbackups
```

Notes:
- Default `dr-create` includes PostgreSQL logical dump (`pg_dumpall`) and excludes raw `/opt/lpdb` + `/lppbackups` for speed.
- Expected PostgreSQL data paths after restore are `/opt/lpdb/cloud/pg16/main`, `/opt/lpdb/onprem/pg16/main`, or `/opt/lpdb/shared/pg16/main` on the DEV stack host.

---

## 2) Verify DR Bundle on DEV Host

Verify latest bundle:

```bash
sudo devadmin dr-verify
```

Verify a specific bundle:

```bash
sudo devadmin dr-verify /antigravity/archives/learnplay-dev-dr-bundle-YYYYMMDD_HHMMSS.tar.gz
```

---

## 3) Prepare Clean DR VM

Assume Ubuntu-based clean VM.

### 3.1 Create admin user and SSH access

On DR VM console (or cloud-init equivalent), ensure a user exists (example `lppadmin`) and SSH access is working.

### 3.2 Enable passwordless sudo for automation (recommended)

On DR VM (as a sudo-capable user):

```bash
sudo tee /etc/sudoers.d/99-lppadmin-automation >/dev/null <<'EOF_SUDO'
lppadmin ALL=(ALL) NOPASSWD:ALL
EOF_SUDO

sudo visudo -cf /etc/sudoers.d/99-lppadmin-automation
sudo -n true && echo "passwordless sudo OK"
```

If you use a different user, replace `lppadmin` accordingly.

### 3.3 Connectivity check from DEV host

On DEV host:

```bash
ssh lppadmin@<DR_HOST> 'hostname -f; whoami; sudo -n true && echo sudo-ok'
```

---

## 4) Restore DR Bundle to DR VM

You can restore in two supported ways.

## Option A (Recommended): Run restore remotely from DEV via devadmin

On DEV host:

```bash
sudo devadmin dr-restore-remote <DR_HOST> lppadmin
```

You will be prompted for:

- Cloud FQDN (used as cloud BASE_URL host)
- OnPrem FQDN (used as onprem BASE_URL host)
- Cloud IP (`/etc/hosts` mapping)
- OnPrem IP (`/etc/hosts` mapping)

Behavior:
- DR VM hostname is not changed.
- `/etc/hosts` is updated with a managed `LEARNPLAY_DR_MAPPING` block.
- Cloud/onprem env + nginx server names are updated to the provided FQDNs.

## Option B: Restore locally on DR VM

### B.1 Copy payload bundle and scripts bundle to DR VM

On DEV host:

```bash
PKG="$(ls -1t /antigravity/archives/learnplay-dev-dr-bundle-*.tar.gz | head -1)"
SCRIPTS="$(ls -1t /antigravity/archives/learnplay-dev-dr-scripts-*.tar.gz | head -1)"
scp "$PKG" "$PKG.sha256" "$SCRIPTS" "$SCRIPTS.sha256" lppadmin@<DR_HOST>:/tmp/
```

### B.2 Extract scripts bundle on DR VM

On DR VM:

```bash
cd /tmp
mkdir -p dr-restorefiles
mv learnplay-dev-dr-bundle-*.tar.gz* learnplay-dev-dr-scripts-*.tar.gz* dr-restorefiles/ 2>/dev/null || true
cd dr-restorefiles
```

Validate scripts bundle checksum and extract:

```bash
sha256sum -c learnplay-dev-dr-scripts-*.tar.gz.sha256
tar -xvf learnplay-dev-dr-scripts-*.tar.gz
```

This gives you `restore-dev-bundle.sh` and `postcheck-dev-restore.sh` without extracting payload files.

Validate payload bundle checksum (do not need to extract it manually):

```bash
sha256sum -c learnplay-dev-dr-bundle-*.tar.gz.sha256
```

You should now see at least:
- `restore-dev-bundle.sh`
- `postcheck-dev-restore.sh`

### B.3 Run restore on DR VM

Interactive run:

```bash
cd /tmp/dr-restorefiles
sudo bash restore-dev-bundle.sh
```

Non-interactive run:

```bash
cd /tmp/dr-restorefiles
sudo bash restore-dev-bundle.sh \
  --bundle /tmp/dr-restorefiles/learnplay-dev-dr-bundle-YYYYMMDD_HHMMSS.tar.gz \
  --cloud-fqdn cloud.example.com \
  --onprem-fqdn onprem.example.com \
  --cloud-ip 192.168.89.50 \
  --onprem-ip 192.168.89.51 \
  --non-interactive
```

Notes:
- In interactive mode, `restore-dev-bundle.sh` auto-detects the latest payload bundle from:
  - current directory
  - `/tmp/dr-restorefiles`
  - `/tmp`
  - `/antigravity/archives`
- You can still force a specific payload via `--bundle`.

### B.4 Manual DR restore sequence (exact commands)

Use this when you want a fully manual DR restore flow on the DR VM.

On DEV host, copy both bundle types:

```bash
PKG="$(ls -1t /antigravity/archives/learnplay-dev-dr-bundle-*.tar.gz | head -1)"
SCR="$(ls -1t /antigravity/archives/learnplay-dev-dr-scripts-*.tar.gz | head -1)"
scp "$PKG" "$PKG.sha256" "$SCR" "$SCR.sha256" lppadmin@<DR_HOST>:/tmp/
```

On DR VM, prepare restore folder and move files:

```bash
cd /tmp
mkdir -p dr-restorefiles
mv learnplay-dev-dr-bundle-*.tar.gz* learnplay-dev-dr-scripts-*.tar.gz* dr-restorefiles/ 2>/dev/null || true
cd dr-restorefiles
ls -ltr
```

Validate checksums:

```bash
sha256sum -c learnplay-dev-dr-scripts-*.tar.gz.sha256
sha256sum -c learnplay-dev-dr-bundle-*.tar.gz.sha256
```

If your `.sha256` file references an absolute source path from DEV (older bundles), use this portable fallback:

```bash
sha256sum learnplay-dev-dr-scripts-*.tar.gz
sha256sum learnplay-dev-dr-bundle-*.tar.gz
```

Extract scripts bundle only:

```bash
tar -xvf learnplay-dev-dr-scripts-*.tar.gz
ls -ltr
```

Run restore interactively (auto-detects latest payload bundle):

```bash
sudo bash restore-dev-bundle.sh
```

If auto-detect is not desired, force specific payload bundle:

```bash
sudo bash restore-dev-bundle.sh \
  --bundle /tmp/dr-restorefiles/learnplay-dev-dr-bundle-YYYYMMDD_HHMMSS.tar.gz
```

Non-interactive explicit run:

```bash
sudo bash restore-dev-bundle.sh \
  --bundle /tmp/dr-restorefiles/learnplay-dev-dr-bundle-YYYYMMDD_HHMMSS.tar.gz \
  --cloud-fqdn cloud.example.com \
  --onprem-fqdn onprem.example.com \
  --cloud-ip 192.168.89.50 \
  --onprem-ip 192.168.89.51 \
  --non-interactive
```

Run post-checks:

```bash
sudo devadmin dr-postcheck
sudo lppadmin cloud runtime-version
sudo lppadmin onprem runtime-version
```

---

## 5) Post-Restore Validation

Run on DR VM:

```bash
sudo devadmin dr-postcheck
```

Also verify runtime details:

```bash
sudo lppadmin cloud runtime-version
sudo lppadmin onprem runtime-version
```

Check key paths:

```bash
sudo ls -ld /opt/learnplay/cloud /opt/learnplay/onprem /opt/lpdb/cloud/pg16/main /opt/lpdb/onprem/pg16/main /opt/lpdb/shared/pg16/main
```

Check hosts mapping:

```bash
grep -n "LEARNPLAY_DR_MAPPING\|cloud\|onprem" /etc/hosts
```

---

## 6) Operational Readiness Checklist

- `devadmin` command works on DR VM.
- `lppadmin` command works on DR VM.
- Cloud and onprem runtime version commands return valid output.
- PostgreSQL reachable and expected databases present.
- Nginx and required LearnPlay services are active (or intentionally configured otherwise).
- Workspace available at `/antigravity/Cloud-On-Prem`.
- SSH keys restored as expected (`/home/lppadmin/.ssh`, `/root/.ssh` where applicable).

---

## 7) Troubleshooting

### Restore hangs on remote step

Likely sudo prompt on DR VM user. Re-check passwordless sudo:

```bash
ssh lppadmin@<DR_HOST> 'sudo -n true && echo ok'
```

### Bundle verify fails

Re-run checksum and integrity checks:

```bash
sudo devadmin dr-verify /path/to/bundle.tar.gz
```

### Services not active after restore

Run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart postgresql nginx
sudo systemctl restart learnplay-cloud || true
sudo systemctl restart learnplay-onprem || true
```

Then rerun post-check:

```bash
sudo devadmin dr-postcheck
```

### Wrong FQDN/IP mapping

Re-run restore with corrected values, or update:

- `/etc/hosts` DR mapping block
- `/opt/learnplay/cloud/.env`
- `/opt/learnplay/onprem/.env`
- `/etc/nginx/sites-available/learnplay-cloud.conf`
- `/etc/nginx/sites-available/learnplay-onprem.conf`

Then reload nginx.

---

## 8) Quick Command Summary

On DEV host:

```bash
sudo devadmin dr-create
sudo devadmin dr-verify
sudo devadmin dr-restore-remote <DR_HOST> lppadmin
```

On DR VM:

```bash
sudo devadmin dr-postcheck
sudo lppadmin cloud runtime-version
sudo lppadmin onprem runtime-version
```
