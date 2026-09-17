# appscan-ignore: insecure-base-image

# Stage 1 – deps: install all dependencies (production + dev) for the build.
FROM node:20-alpine AS deps

# Install OS-level build tools required by native Node add-ons (node-gyp).
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first so Docker's layer cache only busts on dependency changes,
# not on source-code edits.
COPY package.json package-lock.json ./

# Install all dependencies (prod + dev) so the builder stage has everything it
# needs.  The runner stage imports only the production subset.
RUN npm ci

# Stage 2 – builder: compile / bundle application assets.
FROM node:20-alpine AS builder

WORKDIR /app

# Bring in the full node_modules from deps.
COPY --from=deps /app/node_modules ./node_modules

# Copy the full source tree.
COPY . .

# Prune devDependencies — leaves only the production subset needed at runtime.
# This keeps the final image lean and free of test / build tooling.
RUN npm prune --omit=dev

# Stage 3 – runner: minimal production image with a non-root user.
FROM node:20-alpine AS runner

# Create a non-root user matching the conventional name used by Next.js / IBM
# sample apps so downstream conventions are honoured.
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

WORKDIR /app

# Import only the pruned production node_modules from the builder stage.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy application source (server.js, views/, package.json).
# .dockerignore excludes .env, tests/, playwright artefacts, .git, etc.
COPY --chown=nextjs:nodejs . .

# Create writable directory for node-persist
RUN mkdir -p /app/.node-persist \
    && chown -R nextjs:nodejs /app/.node-persist

# Drop root privileges.
USER nextjs

# Expose the port declared in server.js.
EXPOSE 3000

# node-persist writes session state to .node-persist/ relative to WORKDIR;
# the directory is owned by nextjs so writes succeed without privilege escalation.

# Docker / CI readiness probe — used by the GitHub Actions wait-for-ready loop
# and by docker-compose health-checks.
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=6 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
