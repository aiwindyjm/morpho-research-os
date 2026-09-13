ARG IMAGE_REGISTRY=docker.io/library/
FROM ${IMAGE_REGISTRY}node:22-alpine AS build
ENV COREPACK_HOME=/root/.cache/node/corepack
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /workspace
COPY packages/ui/package.json packages/ui/pnpm-lock.yaml packages/ui/
COPY apps/desktop/package.json apps/desktop/pnpm-lock.yaml apps/desktop/
RUN pnpm --dir packages/ui install --frozen-lockfile
RUN pnpm --dir apps/desktop install --frozen-lockfile
COPY packages/ui packages/ui
COPY packages/schemas packages/schemas
COPY apps/desktop apps/desktop
RUN pnpm --dir apps/desktop build

FROM ${IMAGE_REGISTRY}nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/desktop/dist /usr/share/nginx/html
EXPOSE 1420
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:1420/healthz || exit 1
LABEL org.opencontainers.image.title="Morpho Research OS Web Preview" \
      org.opencontainers.image.description="Local-first AI research workspace preview" \
      org.opencontainers.image.source="https://github.com/aiwindyjm/morpho-research"
CMD ["nginx", "-g", "daemon off;"]
