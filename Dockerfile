FROM node:24-alpine AS build
RUN npm install -g bun
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
# Bundling the generated country data needs more heap than the container default
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN bun run build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
