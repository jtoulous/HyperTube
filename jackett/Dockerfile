FROM linuxserver/jackett:0.24.1218

COPY ServerConfig.json /defaults/ServerConfig.json
COPY Indexers/ /defaults/Indexers/

COPY 01-preconfigure-jackett.sh /custom-cont-init.d/01-preconfigure-jackett
RUN chmod +x /custom-cont-init.d/01-preconfigure-jackett

EXPOSE 9117
