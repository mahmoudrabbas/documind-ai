FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npm install --prefer-offline --no-audit --no-fund && npm run dev"]
