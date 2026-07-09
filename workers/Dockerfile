FROM node:20-alpine

WORKDIR /app

COPY workers/package.json workers/package-lock.json* ./

RUN npm install --silent

COPY workers/ .
COPY tsconfig.base.json /tsconfig.base.json

CMD ["npm", "run", "dev"]