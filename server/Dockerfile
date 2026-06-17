# Crossover game server — Node 20 + tsx (no build step; runs TS directly).
FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching. tsx is a devDependency and is needed at
# runtime (the server is run with `tsx src/index.ts`), so install everything.
COPY package.json package-lock.json ./
RUN npm ci

# App source. schema.sql (read at runtime by `npm run migrate`) lives under src/.
COPY tsconfig.json ./
COPY src ./src
COPY certs ./certs

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Drop privileges to the built-in `node` user.
USER node

# Apply schema (idempotent) then start the WebSocket/HTTP server.
CMD ["sh", "-c", "npm run migrate && npm run start"]
