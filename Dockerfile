# === Backend Build Stage ===
FROM node:18-alpine AS backend

WORKDIR /app

# Copy backend dependencies
COPY backend/package.json ./
COPY backend/package-lock.json ./
RUN npm install --production

# Copy backend source code
COPY backend .

# === Frontend Build Stage ===
FROM node:18-alpine AS frontend

WORKDIR /app

# Copy frontend dependencies
COPY frontend/package.json ./
COPY frontend/package-lock.json ./
RUN npm install

# Copy frontend source and build it
COPY frontend .
RUN npm run build

# === Final Stage: Combine Backend + Frontend ===
FROM node:18-alpine

WORKDIR /app

# Copy backend from previous stage
COPY --from=backend /app /app

# Copy built frontend into backend's public folder
COPY --from=frontend /app/dist /app/public

# Install required runtime deps (if any)
RUN npm install --omit=dev

EXPOSE 3001
CMD ["node", "server.js"]
