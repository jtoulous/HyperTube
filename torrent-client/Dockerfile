FROM linuxserver/qbittorrent:latest

COPY qBittorrent.conf /defaults/qBittorrent.conf

# PBKDF2 hash generator + init scripts
COPY gen_pbkdf2.py /app/gen_pbkdf2.py
COPY init-credentials.sh /custom-cont-init.d/10-init-credentials
COPY fix-permissions.sh /custom-cont-init.d/05-fix-permissions
RUN chmod +x /custom-cont-init.d/10-init-credentials /custom-cont-init.d/05-fix-permissions
