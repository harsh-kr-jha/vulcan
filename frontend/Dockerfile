FROM node:26-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci

FROM dependencies AS builder
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY frontend ./frontend
COPY platform.json ./platform.json
RUN npm run build --workspace frontend

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node frontend/package.json ./frontend/package.json
COPY --chown=node:node platform.json ./platform.json
COPY --chown=node:node --from=builder /app/frontend/.next ./frontend/.next
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "frontend"]
