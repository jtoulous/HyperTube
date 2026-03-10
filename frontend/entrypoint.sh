#!/bin/sh
# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
    FORTYTWO_UID: "${FORTYTWO_UID:-}",
    GITHUB_UID:   "${GITHUB_UID:-}",
    DISCORD_UID:  "${DISCORD_UID:-}",
};
EOF

exec "$@"
