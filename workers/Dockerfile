FROM node:22-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY app/package.json app/package.json
COPY workers/package.json workers/package.json

RUN npm ci --workspace workers --include-workspace-root --ignore-scripts

COPY tsconfig.base.json eslint.config.mjs ./
COPY workers/ workers/

WORKDIR /repo/workers

CMD ["npm", "run", "dev"]
