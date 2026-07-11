FROM node:22-bullseye-slim

WORKDIR /app

COPY api/package*.json ./

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python-is-python3 make g++ ca-certificates libcurl4 \
    && rm -rf /var/lib/apt/lists/*
RUN npm install

COPY api/ .
COPY tsconfig.base.json /tsconfig.base.json
COPY eslint.config.mjs /eslint.config.mjs
RUN ln -s /app/node_modules /node_modules

EXPOSE 5000

CMD ["sh", "-c", "npm install --prefer-offline --no-audit --no-fund && npm run dev"]
