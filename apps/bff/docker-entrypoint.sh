#!/usr/bin/env sh
set -euo pipefail

node dist/scripts/migrate.js
node dist/main.js
