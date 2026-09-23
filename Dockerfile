# Stage 1 – deps: install all dependencies (production + dev) for the build.
# registry.access.redhat.com is the public UBI mirror (no Red Hat login required).
# registry.redhat.io is the authenticated mirror — both are IBM policy compliant.
FROM registry.access.redhat.com/ubi9/nodejs-20-minimal:1 AS deps

# npm ci needs write access to /app; switch to root for the install step only.
USER root

WORKDIR /app

# Copy manifests first so Docker's layer cache only busts on dependency changes,
# not on source-code edits.
COPY package.json package-lock.json ./

# Install all dependencies (prod + dev) so the builder stage has everything it
# needs.  The runner stage imports only the production subset.
# No native add-ons in the dependency tree — no OS build tools required.
RUN npm ci

# Stage 2 – builder: compile / bundle application assets.
FROM registry.access.redhat.com/ubi9/nodejs-20-minimal:1 AS builder

USER root

WORKDIR /app

# Bring in the full node_modules from deps.
COPY --from=deps /app/node_modules ./node_modules

# Copy the full source tree.
COPY . .

# Prune devDependencies — leaves only the production subset needed at runtime.
# This keeps the final image lean and free of test / build tooling.
RUN npm prune --omit=dev

# Stage 3 – runner: minimal production image.
# UBI9 nodejs-20-minimal runs as uid 1001 (non-root) by default — no adduser needed.
# gid 0 (root group, no privileges) satisfies OpenShift arbitrary-uid policy.
FROM registry.access.redhat.com/ubi9/nodejs-20-minimal:1 AS runner

USER root

WORKDIR /app

# Import only the pruned production node_modules from the builder stage.
COPY --from=builder --chown=1001:0 /app/node_modules ./node_modules

# Copy application source (server.js, views/, package.json).
# .dockerignore excludes .env, tests/, playwright artefacts, .git, etc.
COPY --chown=1001:0 . .

# Create writable directory for node-persist and hand it to uid 1001.
RUN mkdir -p /app/.node-persist \
    && chown -R 1001:0 /app/.node-persist \
    && chmod -R g=u /app/.node-persist

# Drop to the default non-root user (uid 1001, OpenShift-compatible gid 0).
USER 1001

# Expose the port declared in server.js.
EXPOSE 3000

# node-persist writes session state to .node-persist/ relative to WORKDIR;
# the directory is owned by uid 1001 so writes succeed without privilege escalation.

# Docker / CI readiness probe — used by the GitHub Actions wait-for-ready loop
# and by docker-compose health-checks.
# UBI9 minimal ships curl but not wget.
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=6 \
  CMD curl -sf http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
