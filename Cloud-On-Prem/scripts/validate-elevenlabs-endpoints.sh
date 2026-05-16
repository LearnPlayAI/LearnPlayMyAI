#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

rg -n --no-heading "https://api\\.elevenlabs\\.io/v1/[a-zA-Z0-9_./:-]*" server client \
  | sed -E "s|.*https://api\\.elevenlabs\\.io/v1/|/v1/|g" \
  | sed -E "s|['\" )].*$||" \
  | sort -u > "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "No ElevenLabs endpoints found in repository scan."
  exit 0
fi

allowed_patterns=(
  '^/v1/voices$'
  '^/v1/models$'
  '^/v1/user/subscription$'
  '^/v1/text-to-speech/.*$'
  '^/v1/text-to-dialogue$'
  '^/v1/history/.*$'
)

failed=0
while IFS= read -r endpoint; do
  allowed=0
  for pattern in "${allowed_patterns[@]}"; do
    if [[ "$endpoint" =~ $pattern ]]; then
      allowed=1
      break
    fi
  done
  if [[ $allowed -eq 0 ]]; then
    echo "Disallowed ElevenLabs endpoint detected: $endpoint"
    failed=1
  fi
done < "$TMP_FILE"

if [[ $failed -ne 0 ]]; then
  echo "ElevenLabs endpoint conformance check failed."
  exit 1
fi

echo "ElevenLabs endpoint conformance check passed."
