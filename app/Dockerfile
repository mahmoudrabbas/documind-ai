FROM node:22-alpine

WORKDIR /app

COPY app/package*.json ./

RUN npm install

COPY app/ .
COPY tsconfig.base.json /tsconfig.base.json

EXPOSE 3000

CMD ["npm", "run", "dev"]