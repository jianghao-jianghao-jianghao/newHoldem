# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build React/Vite frontend + esbuild server bundle
# ==============================================================================
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts server.ts ./
COPY src ./src
COPY server ./server

ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

RUN npm run build

# ==============================================================================
# Stage 2: Minimal production runtime (Node 22 native node:sqlite + dist bundle)
# ==============================================================================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Install only the 4 backend runtime packages needed by dist/server.mjs
RUN npm init -y > /dev/null 2>&1 \
  && npm install --omit=dev --no-audit --no-fund express@^4.21.2 ws@^8.23.0 dotenv@^17.2.3 nodemailer@^10.6.1 \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.mjs"]
