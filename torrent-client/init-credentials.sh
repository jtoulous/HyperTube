#!/usr/bin/env bash

CONF="/config/qBittorrent/qBittorrent.conf"

# Wait for the default config to be copied by linuxserver init
if [ ! -f "$CONF" ]; then
    echo "[init-qbt] Config not found yet at $CONF, skipping credential injection."
    exit 0
fi

QB_USER="${QBITTORRENT_USER:-admin}"
QB_PASS="${QBITTORRENT_PASS:-adminadmin}"

echo "[init-qbt] Setting WebUI username to: $QB_USER"

# Generate PBKDF2 hash
HASH=$(python3 /app/gen_pbkdf2.py "$QB_PASS")
echo "[init-qbt] Generated PBKDF2 hash for password"

# Update username
sed -i "s|^WebUI\\\\Username=.*|WebUI\\\\Username=${QB_USER}|" "$CONF"

# Update password hash
sed -i "s|^WebUI\\\\Password_PBKDF2=.*|WebUI\\\\Password_PBKDF2=${HASH}|" "$CONF"

echo "[init-qbt] WebUI credentials updated."
