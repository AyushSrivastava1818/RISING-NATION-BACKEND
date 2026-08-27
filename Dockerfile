# syntax=docker/dockerfile:1
#
# Rising Nation backend — ENGINEERING.md §6.8.
#
# Stateless: no volumes, no local file writes outside process stdout/stderr
# (structured logs go to stdout only — src/utils/logger.ts). The container
# holds no session state (sessions live in Postgres, ARCHITECTURE.md §3.6)
# and writes no files to local disk — the same image is promotable across
# environments purely via injected env vars (§6.9), never rebuilt per-env.
#
# Migrations are NOT run by this image or its entrypoint — per §6.8's
# "migrate -> deploy -> verify readiness -> shift traffic" ordering, the CI
# pipeline runs `prisma migrate deploy` against the target database as its
# own gated step before this image is deployed (see .github/workflows/ci.yml
# and DEPLOY.md). Baking migration execution into container startup would
# race multiple replicas starting concurrently against the same database.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# bcrypt (native module) falls back to compiling from source if no prebuilt
# binary matches the target platform; these make that fallback succeed
# instead of failing the build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

# Drop devDependencies now that the build artifacts (dist/, generated Prisma
# client) exist — keeps the generated client without needing prisma's CLI
# (and its own toolchain) in the runtime image.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# node:*-bookworm-slim doesn't ship OpenSSL. Without it, Prisma's query
# engine can't detect the runtime's actual libssl version, falls back to a
# guess that doesn't match what was generated in the build stage, and the
# process crashes on the first Prisma Client call ("could not locate the
# Query Engine for runtime ..."). Installing openssl here (matching the
# build stage's Debian base, so the same engine binary is valid in both) is
# what the Prisma error itself recommends.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system app && useradd --system --gid app --home /app app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER app

# Metadata default — the actual bound port always comes from the injected
# PORT env var (§6.9), not this value.
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
