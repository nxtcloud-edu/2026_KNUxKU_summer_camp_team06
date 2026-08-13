FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app/services/keep-web/frontend
COPY services/keep-web/frontend/package.json services/keep-web/frontend/package-lock.json ./
RUN npm ci
COPY services/keep-web/frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY src/ ./src/
COPY data/ ./data/
COPY services/keep-web/package.json services/keep-web/package-lock.json ./services/keep-web/
WORKDIR /app/services/keep-web
RUN npm ci --omit=dev

COPY services/keep-web/server/ ./server/
COPY services/keep-web/shared/ ./shared/
COPY services/keep-web/web/ ./web/
COPY services/keep-web/fixtures/ ./fixtures/
COPY --from=frontend-build /app/services/keep-web/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV AGENT_PYTHON=python3
EXPOSE 8080
CMD ["node", "server/index.js"]
