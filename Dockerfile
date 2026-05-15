FROM node:20-slim

WORKDIR /app

# Install build deps for better-sqlite3, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

# Ensure the data directory exists; in production mount a volume here
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
