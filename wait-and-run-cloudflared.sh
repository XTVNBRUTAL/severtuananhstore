#!/bin/sh
set -eu
TOKEN_FILE="/run/tunnel/tunnel-token"
WAIT_SECONDS=0
MAX_WAIT_SECONDS=0 # Keep waiting: Admin may create the Named Tunnel after the website starts.
echo "[Tuan Anh Store] Waiting for the Admin to configure a Named Cloudflare Tunnel..."
while [ ! -s "$TOKEN_FILE" ]; do
  sleep 2
  WAIT_SECONDS=$((WAIT_SECONDS + 2))
  if [ "$MAX_WAIT_SECONDS" -gt 0 ] && [ "$WAIT_SECONDS" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "[Tuan Anh Store] Timed out waiting for $TOKEN_FILE" >&2
    exit 1
  fi
done
# The application and connector share UID 1000, so the connector can read the
# 0600 token file while the read-only volume prevents connector-side changes.
if [ ! -r "$TOKEN_FILE" ]; then
  echo "[Tuan Anh Store] Tunnel token file exists but is not readable by UID $(id -u). Check the tunnel_runtime volume ownership." >&2
  exit 1
fi
echo "[Tuan Anh Store] Tunnel token found. Starting the persistent connector..."
exec /usr/local/bin/cloudflared tunnel --no-autoupdate --metrics 0.0.0.0:2000 run --token-file "$TOKEN_FILE"
