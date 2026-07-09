FROM node:20-alpine

WORKDIR /app

COPY workers/package.json workers/package-lock.json* ./

RUN npm install --silent

COPY workers/ .
COPY tsconfig.base.json /tsconfig.base.json
COPY eslint.config.mjs /eslint.config.mjs
RUN ln -s /app/node_modules /node_modules

CMD ["npm", "run", "dev"]