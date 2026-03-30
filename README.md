# HyperTube

```
docker exec -it hypertube-database psql -U postgres -d hypertube -c "UPDATE watched_films
SET watched_at = NOW() - INTERVAL '2 months'
WHERE imdb_id = 'imdb_id';"
```

```
curl -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"client_id": "test@test.fr", "client_secret": "Testtest1!"}'
```

BONUS:
Some additional Omniauth strategies: discord.
Manage various video resolutions: 720p, 480p, 360p
More API routes.
More sources.
Series handling.
Manage torrents downloads.
