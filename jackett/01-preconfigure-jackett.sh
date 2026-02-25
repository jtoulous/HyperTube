#!/bin/bash

JACKETT_DIR="/config/Jackett"
mkdir -p "${JACKETT_DIR}/Indexers"

if [ ! -f "${JACKETT_DIR}/ServerConfig.json" ]; then
    echo "[init] First run detected — injecting preconfigured Jackett settings..."
    cp /defaults/ServerConfig.json "${JACKETT_DIR}/ServerConfig.json"
    cp /defaults/Indexers/*.json "${JACKETT_DIR}/Indexers/"
    chown -R abc:abc "${JACKETT_DIR}"
    echo "[init] Jackett preconfiguration complete (4 indexers: 1337x, eztv, thepiratebay, yts)."
else
    echo "[init] Existing Jackett config found — skipping preconfiguration."
fi
