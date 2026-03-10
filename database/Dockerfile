FROM postgres:17

COPY init.sql /docker-entrypoint-initdb.d/

CMD ["postgres", \
     "-c", "max_connections=1000", \
     "-c", "shared_buffers=512MB", \
     "-c", "effective_cache_size=1GB", \
     "-c", "work_mem=16MB", \
     "-c", "maintenance_work_mem=128MB", \
     "-c", "checkpoint_completion_target=0.9", \
     "-c", "wal_buffers=16MB", \
     "-c", "random_page_cost=1.1"]

EXPOSE 5432
