ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.21
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    bash \
    curl \
    docker-cli \
    jq \
    mosquitto-clients \
    nodejs \
    npm \
    python3 \
    py3-pip \
    android-tools

WORKDIR /opt/mchs-alert-bridge
COPY bridge/package.json bridge/package-lock.json* ./
RUN npm ci
COPY bridge/tsconfig.json ./
COPY bridge/src ./src
RUN npm run build && npm prune --omit=dev

COPY run.sh /run.sh
COPY redroid /opt/mchs-redroid
COPY provisioning /opt/mchs-provisioning
COPY webui /opt/mchs-webui
RUN chmod +x /run.sh
RUN chmod +x /opt/mchs-redroid/*.sh /opt/mchs-provisioning/*.sh

CMD ["/run.sh"]
