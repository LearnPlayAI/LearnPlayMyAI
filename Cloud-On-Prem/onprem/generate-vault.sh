#!/usr/bin/env bash
set -euo pipefail

# LearnPlay Vault Generator
# Generates an encrypted vault file containing LearnPlay's default API keys
# for Mode B on-prem deployments (LearnPlay manages the keys)
#
# Usage: bash generate-vault.sh <output-path>
#
# The vault passphrase is derived from a fixed key embedded in the server binary.
# This provides obfuscation (not security-through-obscurity for determined attackers,
# but sufficient to prevent casual key extraction from the .env file).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_PATH="${1:-$SCRIPT_DIR/../dist-onprem/vault.enc}"

echo "🔐 LearnPlay Vault Generator"
echo "════════════════════════════"
echo ""

# The vault contains keys that LearnPlay provides for Mode B customers
# These are read from environment variables at build time
VAULT_KEYS=(
  "GEMENI_API_KEY"
  "GAMMA_API_KEY" 
  "MAILERSEND_API_KEY"
  "YOCO_LIVE_SECRET_KEY"
  "YOCO_LIVE_PUBLIC_KEY"
  "YOCO_TEST_SECRET_KEY"
  "YOCO_TEST_PUBLIC_KEY"
  "YOCO_WEBHOOK_SECRET"
)

# Check which keys are available
echo "Checking available keys..."
VAULT_JSON="{"
FIRST=true
MISSING_KEYS=()

for key in "${VAULT_KEYS[@]}"; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      VAULT_JSON+=","
    fi
    # Escape JSON special characters
    escaped_val=$(echo -n "$val" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()), end='')")
    VAULT_JSON+="\"$key\":$escaped_val"
    echo "  ✅ $key"
  else
    MISSING_KEYS+=("$key")
    echo "  ⚠️  $key (not set — will be empty in vault)"
  fi
done
VAULT_JSON+="}"

if [ "$FIRST" = true ]; then
  echo ""
  echo "❌ No keys found in environment. Cannot generate vault."
  echo "   Set the keys as environment variables before running this script."
  echo "   Example: export GEMENI_API_KEY=your_key_here"
  exit 1
fi

echo ""

# Derive vault passphrase from a fixed seed
# This seed is also embedded in the server code for runtime decryption
VAULT_SEED="LP-OnPrem-Vault-2024-AES256-KeyDerivation"
VAULT_PASSPHRASE=$(echo -n "$VAULT_SEED" | openssl dgst -sha256 -hex 2>/dev/null | awk '{print $NF}')

# Encrypt the vault JSON
mkdir -p "$(dirname "$OUTPUT_PATH")"
echo -n "$VAULT_JSON" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -pass pass:"$VAULT_PASSPHRASE" -out "$OUTPUT_PATH"

chmod 644 "$OUTPUT_PATH"

echo "✅ Vault generated: $OUTPUT_PATH"
echo "   Size: $(stat -c%s "$OUTPUT_PATH" 2>/dev/null || wc -c < "$OUTPUT_PATH") bytes"
echo "   Keys included: $((${#VAULT_KEYS[@]} - ${#MISSING_KEYS[@]})) of ${#VAULT_KEYS[@]}"

if [ ${#MISSING_KEYS[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  Missing keys (not included in vault):"
  for mk in "${MISSING_KEYS[@]}"; do
    echo "     - $mk"
  done
fi
echo ""
