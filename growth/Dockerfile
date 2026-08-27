# Crossover Growth OS — Node 20 + tsx (oyun sunucusuyla aynı desen; build'süz).
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY dashboard ./dashboard

# İmajı canlıya sürmeden önce tip/import kayması varsa build'i düşür.
RUN npm run typecheck && npm run test:invariants

ENV NODE_ENV=production
ENV GROWTH_PORT=8090
EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

# Şema idempotent uygulanır, sonra API+worker başlar.
CMD ["sh", "-c", "npm run migrate && npm run start"]
