FROM cloudflare/cloudflared:latest AS cloudflared_bin

FROM node:22-alpine

RUN apk add --no-cache su-exec

ENV NODE_ENV=production \
    TA_STORE_HOST=0.0.0.0 \
    TA_STORE_DATA_DIR=/persist/data \
    TA_STORE_CONFIG_FILE=/persist/config.json \
    CLOUDFLARED_BIN=/usr/local/bin/cloudflared

WORKDIR /app
COPY --from=cloudflared_bin /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY server.js cloudflare-domain.js temporary-tunnel-worker.js app.js index.html styles.css ./
COPY assets ./assets
COPY ta-store-entrypoint.sh /usr/local/bin/ta-store-entrypoint.sh
RUN mkdir -p /persist/data \
    && chmod 0755 /usr/local/bin/cloudflared /usr/local/bin/ta-store-entrypoint.sh \
    && chown -R node:node /app /persist
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/ta-store-entrypoint.sh"]
CMD ["node", "server.js"]
