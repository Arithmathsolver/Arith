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

# === Final Stage: Combine Backend + Frontend + Python OCR ===
FROM python:3.10-slim AS final

WORKDIR /app

# Install Node.js (for server)
RUN apt update && apt install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt install -y nodejs && \
    npm install -g npm

# Install Python OCR deps
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend from build stage
COPY --from=backend /app /app

# Copy built frontend into backend public folder
COPY --from=frontend /app/dist /app/public

# Install any runtime node deps (if needed)
RUN npm install --omit=dev

EXPOSE 3001
CMD ["node", "server.js"]
