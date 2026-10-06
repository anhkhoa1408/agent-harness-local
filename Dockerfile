FROM node:24.18.0-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git openssh-client python3 socat gh \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g --omit=optional @openai/codex@0.159.0-alpha.12.1 \
    && git config --system --add safe.directory '*' \
    && git config --system user.name anhkhoa1408 \
    && git config --system user.email akhoa981@gmail.com

# Install the platform binary explicitly: npm may silently skip optional downloads.
RUN codex_arch="$(node -p process.arch)" \
    && npm install -g "@openai/codex-linux-${codex_arch}@npm:@openai/codex@0.159.0-alpha.12.1-linux-${codex_arch}" \
    && codex --version

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    HARNESS_PRODUCTION=1 \
    HARNESS_HOST=0.0.0.0 \
    HARNESS_OAUTH_PROXY=1 \
    HARNESS_DATA_DIR=/data \
    CODEX_HOME=/codex
EXPOSE 3000
CMD ["node", "scripts/dev.mjs"]
