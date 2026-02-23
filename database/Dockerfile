FROM postgres:17

# Copy initialization scripts (will run on first startup)
COPY init.sql /docker-entrypoint-initdb.d/

# High-performance settings for load testing (thousands of users)
CMD ["postgres", \
     "-c", "max_connections=1000", \
     "-c", "shared_buffers=512MB", \
     "-c", "effective_cache_size=1GB", \
     "-c", "work_mem=16MB", \
     "-c", "maintenance_work_mem=128MB", \
     "-c", "checkpoint_completion_target=0.9", \
     "-c", "wal_buffers=16MB", \
     "-c", "random_page_cost=1.1"]

# Expose PostgreSQL port
EXPOSE 5432
