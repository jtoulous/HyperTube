FROM linuxserver/qbittorrent:latest

COPY qBittorrent.conf /defaults/qBittorrent.conf

# PBKDF2 hash generator + init script that syncs credentials from env vars
COPY gen_pbkdf2.py /app/gen_pbkdf2.py
COPY init-credentials.sh /custom-cont-init.d/10-init-credentials
