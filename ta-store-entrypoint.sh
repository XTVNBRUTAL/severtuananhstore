#!/bin/sh
set -eu

# Railway attaches volumes as root. Prepare the mounted data path, then drop
# privileges before starting the Node.js application.
DATA_DIR="${TA_STORE_DATA_DIR:-/persist/data}"
CONFIG_FILE="${TA_STORE_CONFIG_FILE:-/persist/config.json}"
mkdir -p "$DATA_DIR" "$(dirname "$CONFIG_FILE")" /persist
chown -R node:node /persist

exec su-exec node "$@"
