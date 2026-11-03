FROM node:22-bookworm-slim

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
