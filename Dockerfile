# 1. Install every dependency (dev included: Tailwind/Vite are build-time only).
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2. Build the Nuxt/Nitro bundle.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Download the bilingual embedding model (Xenova/bge-m3, ~590 MB) once.
#    It is public, so HF_TOKEN is optional and only needed for rate limits.
FROM node:24-bookworm-slim AS model
WORKDIR /app
COPY scripts/fetch-model.js ./scripts/fetch-model.js
ARG HF_TOKEN=""
RUN HF_TOKEN="$HF_TOKEN" node scripts/fetch-model.js

# 4. Minimal runtime image: Nitro output + the model, nothing else.
FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    FEEDWIRE_ROOT=/app

COPY --chown=node:node --from=build /app/.output ./.output
COPY --chown=node:node --from=model /app/models ./models
RUN mkdir -p models/.cache && chown -R node:node models

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
