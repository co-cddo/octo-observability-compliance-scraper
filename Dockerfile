ARG NODE_IMAGE_TAG=20-slim

FROM node:${NODE_IMAGE_TAG} AS chromium

RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
  && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/pw-browsers
RUN npx playwright@1.59.1 install chromium

FROM node:${NODE_IMAGE_TAG} AS build

WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN npm install -g $(npm pkg get packageManager | tr -d '"')
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:${NODE_IMAGE_TAG} AS release

RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=chromium /pw-browsers /pw-browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/pw-browsers

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/.npmrc ./
RUN npm install -g $(npm pkg get packageManager | tr -d '"')
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./dist/db/migrations
COPY --from=build /app/src/server/views ./dist/server/views
COPY --from=build /app/src/server/static ./dist/server/static
COPY --from=build /app/services.json ./services.json
COPY --from=build /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

RUN chown -R node:node /app /pw-browsers
EXPOSE 3000
USER node
ENTRYPOINT ["./docker-entrypoint.sh"]
