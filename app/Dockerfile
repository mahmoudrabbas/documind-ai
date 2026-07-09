FROM node:22-alpine

WORKDIR /app

COPY app/package*.json ./

RUN npm install

COPY app/ .
COPY tsconfig.base.json /tsconfig.base.json
COPY eslint.config.mjs /eslint.config.mjs
RUN ln -s /app/node_modules /node_modules

EXPOSE 3000

CMD ["npm", "run", "dev"]