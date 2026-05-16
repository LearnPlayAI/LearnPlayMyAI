#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $0 --scope <cloud|onprem> --version <LP-..> --output <path> [options]

Options:
  --build-date <timestamp>      Header timestamp (default: OS timezone now)
  --changelog-file <path>       Global changelog (default: /antigravity/docs/handoverdocs/CHANGELOG.md)
  --marker-file <path>          Scope marker file for incremental notes
  --state-output <path>         Output state snapshot for caller to persist after successful build
  --changelog-output <path>     Optional package changelog extract output
USAGE
}

SCOPE=""
VERSION=""
OUTPUT=""
BUILD_DATE="$(date +"%Y-%m-%d %H:%M:%S %Z %:z")"
CHANGELOG_FILE="/antigravity/docs/handoverdocs/CHANGELOG.md"
MARKER_FILE=""
STATE_OUTPUT=""
CHANGELOG_OUTPUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --build-date) BUILD_DATE="$2"; shift 2 ;;
    --changelog-file) CHANGELOG_FILE="$2"; shift 2 ;;
    --marker-file) MARKER_FILE="$2"; shift 2 ;;
    --state-output) STATE_OUTPUT="$2"; shift 2 ;;
    --changelog-output) CHANGELOG_OUTPUT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

case "$SCOPE" in
  cloud|onprem) ;;
  *) echo "--scope must be cloud or onprem" >&2; exit 1 ;;
esac
[ -n "$VERSION" ] || { echo "--version is required" >&2; exit 1; }
[ -n "$OUTPUT" ] || { echo "--output is required" >&2; exit 1; }

if [ ! -f "$CHANGELOG_FILE" ]; then
  echo "Changelog file not found: $CHANGELOG_FILE" >&2
  exit 1
fi

marker_last_id=""
marker_last_ts=""
if [ -n "$MARKER_FILE" ] && [ -f "$MARKER_FILE" ]; then
  # shellcheck disable=SC1090
  source "$MARKER_FILE"
  marker_last_id="${LAST_ENTRY_ID:-}"
  marker_last_ts="${LAST_ENTRY_TIMESTAMP:-}"
fi

entries_tsv="$(mktemp)"
awk '
BEGIN {
  id=""; ts=""; variant=""; issue=""; fix=""; err=0;
}
function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
function flush_entry(){
  if (id == "") return;
  id=trim(id); ts=trim(ts); variant=trim(variant); issue=trim(issue); fix=trim(fix);
  if (ts=="" || variant=="" || issue=="" || fix=="") {
    print "Malformed changelog entry: " id " (missing required fields)" > "/dev/stderr";
    err=1;
  } else if (variant!="cloud" && variant!="onprem" && variant!="both") {
    print "Malformed changelog entry: " id " (invalid Variant: " variant ")" > "/dev/stderr";
    err=1;
  } else {
    print id "\t" ts "\t" variant "\t" issue "\t" fix;
  }
}
/^##[[:space:]]+Entry[[:space:]]+/ {
  flush_entry();
  id=$3; ts=""; variant=""; issue=""; fix="";
  next;
}
/^- Timestamp:[[:space:]]*/ { line=$0; sub(/^- Timestamp:[[:space:]]*/, "", line); ts=trim(line); next; }
/^- Variant:[[:space:]]*/   { line=$0; sub(/^- Variant:[[:space:]]*/, "", line); variant=trim(line); next; }
/^- Issue:[[:space:]]*/     { line=$0; sub(/^- Issue:[[:space:]]*/, "", line); issue=trim(line); next; }
/^- Fix:[[:space:]]*/       { line=$0; sub(/^- Fix:[[:space:]]*/, "", line); fix=trim(line); next; }
END {
  flush_entry();
  if (err != 0) exit 2;
}
' "$CHANGELOG_FILE" > "$entries_tsv"

if [ ! -s "$entries_tsv" ]; then
  echo "No valid changelog entries found in $CHANGELOG_FILE" >&2
  rm -f "$entries_tsv"
  exit 1
fi

include_tsv="$(mktemp)"
found_marker=0
start_collect=0
if [ -z "$marker_last_id" ]; then
  start_collect=1
fi

while IFS=$'\t' read -r id ts variant issue fix; do
  case "$SCOPE" in
    cloud)
      [ "$variant" = "cloud" ] || [ "$variant" = "both" ] || continue
      ;;
    onprem)
      [ "$variant" = "onprem" ] || [ "$variant" = "both" ] || continue
      ;;
  esac

  if [ -n "$marker_last_id" ] && [ "$start_collect" -eq 0 ]; then
    if [ "$id" = "$marker_last_id" ]; then
      found_marker=1
      start_collect=1
    fi
    continue
  fi

  if [ "$start_collect" -eq 1 ] && [ -n "$marker_last_id" ] && [ "$id" = "$marker_last_id" ]; then
    continue
  fi

  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$ts" "$variant" "$issue" "$fix" >> "$include_tsv"
done < "$entries_tsv"

if [ -n "$marker_last_id" ] && [ "$found_marker" -eq 0 ]; then
  # Marker not found in changelog; rebuild baseline from all relevant entries.
  : > "$include_tsv"
  while IFS=$'\t' read -r id ts variant issue fix; do
    case "$SCOPE" in
      cloud)
        [ "$variant" = "cloud" ] || [ "$variant" = "both" ] || continue
        ;;
      onprem)
        [ "$variant" = "onprem" ] || [ "$variant" = "both" ] || continue
        ;;
    esac
    printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$ts" "$variant" "$issue" "$fix" >> "$include_tsv"
  done < "$entries_tsv"
fi

mkdir -p "$(dirname "$OUTPUT")"
{
  echo "LearnPlay Release Notes"
  echo "Package Scope: ${SCOPE}"
  echo "Package Version: ${VERSION}"
  echo "Build Date (System TZ): ${BUILD_DATE}"
  if [ -n "$marker_last_id" ]; then
    echo "Changes Since Entry: ${marker_last_id}"
  else
    echo "Changes Since Entry: initial baseline"
  fi
  echo ""
  echo "Included Change Log"
  echo ""

  count=0
  last_id="$marker_last_id"
  last_ts="$marker_last_ts"
  while IFS=$'\t' read -r id ts variant issue fix; do
    [ -n "$id" ] || continue
    count=$((count + 1))
    last_id="$id"
    last_ts="$ts"
    echo "Change ${count}"
    echo "Entry: ${id}"
    echo "Timestamp: ${ts}"
    echo "Variant: ${variant}"
    echo "Issue: ${issue}"
    echo "Fix: ${fix}"
    echo ""
  done < "$include_tsv"

  if [ "$count" -eq 0 ]; then
    echo "No new issues/fixes were recorded for this scope since the previous build baseline."
    echo "Issue: No pending user-facing issues in this build window."
    echo "Fix: Package rebuilt with no new changelog entries for this scope."
  fi

  echo ""
  if [ "$SCOPE" = "cloud" ]; then
    echo "Scope Note: Includes entries tagged cloud and both."
  else
    echo "Scope Note: Includes entries tagged onprem and both."
  fi
} > "$OUTPUT"

if [ -n "$CHANGELOG_OUTPUT" ]; then
  mkdir -p "$(dirname "$CHANGELOG_OUTPUT")"
  {
    echo "LearnPlay Packaged Changelog"
    echo "Package Scope: ${SCOPE}"
    echo "Package Version: ${VERSION}"
    echo "Build Date (System TZ): ${BUILD_DATE}"
    if [ -n "$marker_last_id" ]; then
      echo "Changes Since Entry: ${marker_last_id}"
    else
      echo "Changes Since Entry: initial baseline"
    fi
    echo ""
    if [ -s "$include_tsv" ]; then
      while IFS=$'\t' read -r id ts variant issue fix; do
        [ -n "$id" ] || continue
        echo "## Entry ${id}"
        echo "- Timestamp: ${ts}"
        echo "- Variant: ${variant}"
        echo "- Issue: ${issue}"
        echo "- Fix: ${fix}"
        echo ""
      done < "$include_tsv"
    else
      echo "No new entries included for this package scope."
    fi
  } > "$CHANGELOG_OUTPUT"
fi

if [ -n "$STATE_OUTPUT" ]; then
  mkdir -p "$(dirname "$STATE_OUTPUT")"
  state_last_id="$marker_last_id"
  state_last_ts="$marker_last_ts"
  if [ -s "$include_tsv" ]; then
    state_last_id="$(tail -n 1 "$include_tsv" | cut -f1)"
    state_last_ts="$(tail -n 1 "$include_tsv" | cut -f2)"
  fi
  {
    echo "LAST_ENTRY_ID=$(printf '%q' "${state_last_id}")"
    echo "LAST_ENTRY_TIMESTAMP=$(printf '%q' "${state_last_ts}")"
    echo "LAST_BUILD_SCOPE=$(printf '%q' "${SCOPE}")"
    echo "LAST_BUILD_VERSION=$(printf '%q' "${VERSION}")"
    echo "LAST_BUILD_AT=$(printf '%q' "${BUILD_DATE}")"
  } > "$STATE_OUTPUT"
fi

echo "Generated release notes: $OUTPUT"
[ -n "$CHANGELOG_OUTPUT" ] && echo "Generated package changelog: $CHANGELOG_OUTPUT"
[ -n "$STATE_OUTPUT" ] && echo "Generated changelog state: $STATE_OUTPUT"

rm -f "$entries_tsv" "$include_tsv"
