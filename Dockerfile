# Nova CMS – production image for Railway (or any Docker host).
# Official Node image via the AWS mirror of Docker Hub: same image, no anonymous pull limit (Docker Hub answered 429).

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
# fontconfig: libvips/Pango needs it to set social-preview images in the theme fonts.
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
