#!/usr/bin/env bash
echo "[init-qbt] Fixing /downloads permissions..."
mkdir -p /downloads
chown -R abc:abc /downloads
chmod -R 755 /downloads
echo "[init-qbt] /downloads is now owned by abc."
