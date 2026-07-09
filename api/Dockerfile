FROM node:22-alpine

WORKDIR /app

COPY api/package*.json ./

RUN npm install

COPY api/ .
COPY tsconfig.base.json /tsconfig.base.json

EXPOSE 5000

CMD ["sh", "-c", "npm install --prefer-offline --no-audit --no-fund && npm run dev"]