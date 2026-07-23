FROM node:22-bookworm-slim

WORKDIR /repo

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY app/package.json app/package.json
COPY workers/package.json workers/package.json

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci --workspace api --workspace workers --include-workspace-root --ignore-scripts \
    && npm rebuild argon2

COPY tsconfig.base.json eslint.config.mjs ./
COPY workers/ workers/
RUN npm run build --workspace workers

COPY api/ api/

WORKDIR /repo/api

EXPOSE 5000

CMD ["npm", "run", "dev"]
