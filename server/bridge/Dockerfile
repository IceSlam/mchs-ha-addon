FROM node:22-alpine

RUN apk add --no-cache android-tools bash curl jq

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

EXPOSE 8765 8766
CMD ["node", "dist/index.js"]
