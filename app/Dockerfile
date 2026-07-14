FROM node:22-alpine

WORKDIR /repo

RUN test "$(npm --version)" = "10.9.8"

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY app/package.json app/package.json
COPY workers/package.json workers/package.json
RUN npm ci --workspace app --include-workspace-root

COPY app/ app/
COPY tsconfig.base.json eslint.config.mjs ./

WORKDIR /repo/app

EXPOSE 3000

CMD ["npm", "run", "dev"]
