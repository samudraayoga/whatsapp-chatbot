FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY whatsapp-control-panel/package*.json ./
RUN npm ci

COPY whatsapp-control-panel/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY whatsapp-control-panel/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
