#!/usr/bin/env bash
# Generates a complete, idempotent schema SQL from all migration files
set -euo pipefail

MIGRATIONS_DIR="${1:-.}"
OUTPUT="${2:-schema-full.sql}"

echo "-- LearnPlay Complete Schema" > "$OUTPUT"
echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTPUT"
echo "-- This file creates the entire database schema from scratch." >> "$OUTPUT"
echo "-- Safe to re-run: uses IF NOT EXISTS / DO \$\$ EXCEPTION patterns." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Process each migration file in order
for sql_file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  echo "" >> "$OUTPUT"
  echo "-- ============================================" >> "$OUTPUT"
  echo "-- Migration: $(basename "$sql_file")" >> "$OUTPUT"
  echo "-- ============================================" >> "$OUTPUT"
  
  # Process the file with awk to make statements idempotent
  awk '
  # Track if we are inside a DO $$ block
  /^DO \$\$/ { in_do_block=1 }
  /^END \$\$;/ { in_do_block=0; print; next }
  
  # Wrap bare CREATE TYPE in safe blocks
  /^CREATE TYPE "[^"]+" AS ENUM/ && !in_do_block {
    print "DO $$ BEGIN"
    print "  " $0
    print "EXCEPTION WHEN duplicate_object THEN null;"
    print "END $$;"
    next
  }
  
  # Add IF NOT EXISTS to CREATE TABLE (only if not already there)
  /^CREATE TABLE / && !/IF NOT EXISTS/ {
    sub(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
  }
  
  # Add IF NOT EXISTS to CREATE INDEX (only if not already there) 
  /^CREATE INDEX / && !/IF NOT EXISTS/ {
    sub(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
  }
  
  # Add IF NOT EXISTS to CREATE UNIQUE INDEX (only if not already there)
  /^CREATE UNIQUE INDEX / && !/IF NOT EXISTS/ {
    sub(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  }
  
  # Skip Drizzle statement breakpoint comments
  /^--> statement-breakpoint/ { next }
  
  { print }
  ' "$sql_file" >> "$OUTPUT"
done

echo "" >> "$OUTPUT"
echo "-- Schema generation complete" >> "$OUTPUT"
echo "Generated: $OUTPUT ($(wc -l < "$OUTPUT") lines)"
