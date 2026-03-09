# HyperTube

```
docker exec -it hypertube-database psql -U postgres -d hypertube -c "UPDATE watched_films
SET watched_at = NOW() - INTERVAL '2 months'
WHERE imdb_id = 'imdb_id';"
```

BONUS:
Some additional Omniauth strategies: discord.
Manage various video resolutions: 720p, 480p, 360p
More API routes.
Series handling.
Manage torrents downloads
