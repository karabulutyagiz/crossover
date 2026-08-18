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
COPY admin ./admin

# Fail the image build before replacing the live container if imports/types drift.
RUN npm run typecheck

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Drop privileges to the built-in `node` user.
USER node

# Apply schema (idempotent) then start the WebSocket/HTTP server.
CMD ["sh", "-c", "npm run migrate && npm run start"]
