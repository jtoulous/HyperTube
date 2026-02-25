FROM linuxserver/jackett:latest

# Stage preconfigured settings and indexers into the image
COPY ServerConfig.json /defaults/ServerConfig.json
COPY Indexers/ /defaults/Indexers/

# Custom s6-overlay init script: copies config on first run only
# If config already exists (volume has data), it skips to preserve runtime changes
COPY 01-preconfigure-jackett.sh /custom-cont-init.d/01-preconfigure-jackett
RUN chmod +x /custom-cont-init.d/01-preconfigure-jackett

EXPOSE 9117
