# Holly Would — Railway production image
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN mkdir -p /data

EXPOSE 3000

# Railway injects PORT — must bind it
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
