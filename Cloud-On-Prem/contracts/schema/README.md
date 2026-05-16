# Schema Contracts

This directory stores product-scoped schema contracts:

- `cloud-contract.env` / `cloud-contract.json`
- `onprem-contract.env` / `onprem-contract.json`
- `shared-contract.env` / `shared-contract.json`

## Generate contracts

```bash
scripts/schema/generate-contract.sh --product cloud
scripts/schema/generate-contract.sh --product onprem
scripts/schema/generate-shared-contract.sh
```

## Validate contracts

```bash
scripts/schema/validate-contract.sh --product cloud
scripts/schema/validate-contract.sh --product onprem
scripts/schema/validate-shared.sh
```

## Notes

- Product contracts enforce parity **within** a product line.
- Shared contract enforces parity only for tables listed in `shared-tables.txt`.
- Cloud and OnPrem may intentionally diverge outside shared scope.
