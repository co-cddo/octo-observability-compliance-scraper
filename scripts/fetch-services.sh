#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-services.json}"
REPO_URL="https://github.com/x-govuk/govuk-services-list.git"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Cloning ${REPO_URL}..." >&2
git clone --depth 1 "$REPO_URL" "$tmp" 2>&1

count=$(find "$tmp/data/services" -name '*.json' ! -name '_template.json' | wc -l | tr -d ' ')
jq -s '.' "$tmp"/data/services/*.json > "$OUTPUT"

echo "Wrote ${count} services to ${OUTPUT}" >&2
