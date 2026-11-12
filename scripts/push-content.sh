#!/usr/bin/env bash
# Push seed changes to the deployed preview: asks for an EmDash API token (hidden), then runs the
# seed sync, SEO values and any one-off scripts passed as arguments. Usage:
#   scripts/push-content.sh [scripts/one-off/<name>.mjs ...]
set -euo pipefail
cd "$(dirname "$0")/.."
export EMDASH_URL="${EMDASH_URL:-https://dsa-fort-worth-site.adamgemerson.workers.dev}"
read -rsp "EmDash API token for $EMDASH_URL (hidden): " EMDASH_TOKEN && echo
export EMDASH_TOKEN
node scripts/sync-seed.mjs
node scripts/seo.mjs
for extra in "$@"; do node "$extra"; done
echo "All done."
