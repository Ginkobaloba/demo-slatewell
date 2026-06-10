# Slatewell demo container. The SQLite database is seeded at IMAGE BUILD
# time (calendar dates anchor to the build day); runtime writes (new
# bookings) land in the container layer and reset on redeploy, which is
# the accepted posture for the demo fleet.
#
# Build/deploy via cloudflare-config\scripts\deploy-demo.ps1:
#   deploy-demo.ps1 -Name slatewell -ContextPath C:\dev\demo-slatewell -InternalPort 3000

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run db:seed
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/data ./data

EXPOSE 3000
CMD ["node", "server.js"]
