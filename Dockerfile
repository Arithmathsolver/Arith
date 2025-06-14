# Backend
FROM node:18-alpine AS backend

WORKDIR /app
COPY backend/package.json backend/yarn.lock ./
RUN npm install --production
COPY backend .
EXPOSE 3001
CMD ["node", "server.js"]

# Frontend
FROM node:18-alpine AS frontend

WORKDIR /app
COPY frontend/package.json frontend/yarn.lock ./
RUN npm install
COPY frontend .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
