# ───────────────
# Frontend Dockerfile — Next.js (Standalone Mode)
# ───────────────
# 1. Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm install

# Kaynak kodları kopyala
COPY . .

# Build args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

RUN npm run build

# 2. Run Stage
FROM node:20-slim AS runner

WORKDIR /app

# Sadece standalone çıktı klasörünü ve statik dosyaları kopyala
# Bu yöntem node_modules kopyalamaktan çok daha hızlı ve hafiftir (+%90 küçülme)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Kök dizindeki next.config.ts standalone içinde gerekebilir (opsiyonel ama güvenli)
COPY --from=builder /app/next.config.ts ./

EXPOSE 3000

# Standalone modda uygulama `server.js` ile başlar
CMD ["node", "server.js"]
