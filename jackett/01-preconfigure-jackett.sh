#!/bin/bash

JACKETT_DIR="/config/Jackett"
mkdir -p "${JACKETT_DIR}/Indexers"

if [ ! -f "${JACKETT_DIR}/ServerConfig.json" ]; then
    cp /defaults/ServerConfig.json "${JACKETT_DIR}/ServerConfig.json"
    cp /defaults/Indexers/*.json "${JACKETT_DIR}/Indexers/"
    chown -R abc:abc "${JACKETT_DIR}"
fi
