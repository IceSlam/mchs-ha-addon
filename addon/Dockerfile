ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.21
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /opt/mchs-alert-bridge
COPY bridge/package.json bridge/package-lock.json* ./
RUN npm ci
COPY bridge/tsconfig.json ./
COPY bridge/src ./src
RUN npm run build && npm prune --omit=dev

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
