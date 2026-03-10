FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:stable-alpine

# Copy the built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the entrypoint that generates /config.js at runtime
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Custom nginx config: SPA fallback + /api proxy
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 8081;

    root /usr/share/nginx/html;
    index index.html;

    # Proxy API calls to the backend
    location /api/ {
        proxy_pass http://hypertube-backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # SPA: serve index.html for all non-file routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 8081

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
