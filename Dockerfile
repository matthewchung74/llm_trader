FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY system-prompt.md ./
COPY tsconfig.json ./

# Create results directory for data persistence
RUN mkdir -p results/default

# Install tsx globally
RUN npm install -g tsx

# Set environment variable for Node.js
ENV NODE_ENV=production

# Default command - can be overridden
CMD ["npm", "run", "start:continuous"]

# Health check
HEALTHCHECK --interval=5m --timeout=30s --start-period=40s --retries=3 \
  CMD ps aux | grep -q '[n]ode.*agent.ts' || exit 1