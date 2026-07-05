FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --silent

# Copy source (overridden by bind mount in development)
COPY . .

# Default command for dev; container will pick up local changes when volume-mounted
CMD ["npm", "run", "dev"]
