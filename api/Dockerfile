FROM node:22-alpine

WORKDIR /app

COPY api/package*.json ./

RUN npm install

COPY api/ .
COPY tsconfig.base.json /tsconfig.base.json
COPY eslint.config.mjs /eslint.config.mjs
RUN ln -s /app/node_modules /node_modules

EXPOSE 5000

CMD ["sh", "-c", "npm install --prefer-offline --no-audit --no-fund && npm run dev"]