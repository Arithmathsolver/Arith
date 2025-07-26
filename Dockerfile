# Base image with Node.js + Python
FROM node:18-slim

# Install Python and system dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-dev libglib2.0-0 libsm6 libxrender1 libxext6 && \
    pip install torch torchvision transformers Pillow

# Set working directory
WORKDIR /app

# Copy backend files
COPY backend/package*.json ./
RUN npm install
COPY backend ./

# Copy frontend and build it
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install && npm run build
COPY frontend /app/frontend

# Move frontend build to backend public
RUN mkdir -p public && cp -r frontend/dist/* public/

EXPOSE 3001
CMD ["node", "server.js"]
