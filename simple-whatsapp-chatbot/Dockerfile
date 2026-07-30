FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY baileys-antiban/package.json /baileys-antiban/package.json
COPY baileys-antiban/dist /baileys-antiban/dist
COPY simple-whatsapp-chatbot/package*.json ./
RUN npm ci

FROM deps AS builder
COPY simple-whatsapp-chatbot/tsconfig.json ./
COPY simple-whatsapp-chatbot/src ./src
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY baileys-antiban/package.json /baileys-antiban/package.json
COPY baileys-antiban/dist /baileys-antiban/dist
COPY simple-whatsapp-chatbot/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p auth && chown node:node auth
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
