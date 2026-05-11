# Moboost MAAS — Frontend (Next.js)
# Development image with hot-reload support

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy config files
COPY next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./

# Copy application code
COPY src ./src
COPY public ./public
COPY data ./data

EXPOSE 3000

# Dev mode with hot-reload
CMD ["npm", "run", "dev"]
