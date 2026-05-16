# Technical Secrets Template (Fill Locally)

Important:
- Keep this file private.
- Do not paste real secrets into non-secret docs.
- Preferred filename for real values: `TECHNICAL_SECRETS.local.md`.

## 1. Global Defaults
- admin_email:
- admin_password:
- timezone:

## 2. cloud ACC
- ssh_host:
- ssh_port: 22
- ssh_user: lppadmin
- ssh_password:
- ssh_alias: acc-cloud-devadmin
- sudo_mode: passwordless|password-required
- base_url:
- caddy_routed: true|false

## 3. cloud PRD
- ssh_host:
- ssh_port: 22
- ssh_user: lppadmin
- ssh_password:
- ssh_alias: prd-cloud-devadmin
- sudo_mode: passwordless|password-required
- base_url:
- caddy_routed: true|false

## 4. onprem ACC
- ssh_host:
- ssh_port: 22
- ssh_user: lppadmin
- ssh_password:
- ssh_alias: acc-onprem-devadmin
- sudo_mode: passwordless|password-required
- base_url:
- caddy_routed: true|false

## 5. onprem PRD
- ssh_host:
- ssh_port: 22
- ssh_user: lppadmin
- ssh_password:
- ssh_alias: prd-onprem-devadmin
- sudo_mode: passwordless|password-required
- base_url:
- caddy_routed: true|false

## 6. Reverse Proxy (Caddy)
- host:
- user:
- password_or_key_reference:
- managed_domains:

## 7. Database (if needed for direct operations)
For each system include:
- db_host:
- db_port:
- db_name:
- db_user:
- db_password:
- credential_source_path:

## 8. API Keys/External Secrets
- yoco_or_payment_secret_ref:
- ai_provider_keys_ref:
- smtp_secret_ref:

## 9. Snapshot Catalog
For each host:
- clean_os_snapshot_name:
- fresh_app_install_snapshot_name:
- latest_known_good_snapshot_name:
- restore_owner:

